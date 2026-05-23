# Repository Code Review

A comprehensive review of `lib/music/repository` against the goals stated in `REPO_README.md`:

> Performant (1M+ songs) · Fast (parallel) · Safe (no data loss) · Easy to use · Resilient.

This document is written for **Sonnet 4.5** to act on. Each finding has:
- **Severity** (Critical / High / Medium / Low / Nit)
- **Location** (`file:line` where applicable)
- **Symptom** (what goes wrong)
- **Fix** (concrete change)
- **Why it matters** in terms of the stated goals or invariants

### 🚧 KNOWN LIMITATIONS & FUTURE WORK

The following issues from the review remain and should be addressed in future iterations:

**Critical (FIXED)**:
- ✅ [R1]: adoptItem atomicity implemented with stage-then-commit + DB rollback
- ✅ [NEW-M14]: length field now prefers LocalTagsSource (audio file) over MusicBrainz
- ✅ [NEW-R16 + NEW-D8]: album `added` timestamp preserved on updates

**High Priority (FIXED)**:
- ✅ [NEW-B17]: ReplayGain source now registered in dataSources
- ✅ [NEW-A1]: NULL-safe album lookup implemented
- ✅ [NEW-CV1]: Focused updateAlbumArtpath function to prevent lost updates
- ✅ [NEW-W11]: ffmpeg timeout added (60s for writeback, 30s for ReplayGain)
- ✅ [NEW-M15 & NEW-M16]: Ordered vs unordered array merging with confidence threshold
- ✅ [D1 / NEW-DB1]: Schema introspection cached for items and albums
- ✅ [R11]: Item `added` timestamp preserved on updates

**High Priority (remaining)**:
- [B2]: Module-level rate limiting is racy (needs p-queue or promise chain)
- [B3-B15]: Various source bugs (retry logic, API keys, etc.)
- [R3-R15]: Repository issues (N+1 queries, sequential pre-filter, etc.)
- [W3]: Use format-specific tag writers instead of ffmpeg (performance)
- [C1-C8]: Cover art issues (races, overwrites, etc.)
- [D2-D7]: Database layer inefficiencies

**Medium/Low Priority (FIXED)**:
- ✅ [NEW-CF4]: Config normalization for music_directory and trash_directory
- ✅ [NEW-M17 & M8]: Dead branches removed from merger
- ✅ [NEW-M19]: Unnecessary re-sorts removed (already sorted by confidence)

**Architectural**:
- Arch-1: Move to Result<Partial<Item>, Error> for sources
- Arch-2: Persist source provenance (*_source columns)
- Arch-3: Dependency injection instead of singleton
- Arch-4: Job queue with backpressure
- Arch-5: Structured logging

See individual sections below for full details on remaining issues.

---

## TL;DR (action-ordered top hits)

1. **Sources return `Item` on failure** — the SourceResult contract makes "no data" indistinguishable from "real data" for the merger. Move to `Result<Partial<Item>, Error>`. See [T1] and [Arch‑1].
2. **`reconcile-service` loses watcher events while a reconcile is running** — debounced trigger fires, `isReconciling` guard drops it, no requeue. See [S1].
3. **Module-level rate-limit state is racy across `Promise.all`**. Both MusicBrainz and Discogs share this bug. See [B2].
4. **`_resolveItem` checks for `merged.error` but `mergeData` never sets it**. See [R4].
5. **Reconcile Step 3 does an N+1 query on `getItemById`**. See [R5].
6. **Duplicate-check pre-filter is sequential, not parallel**. See [R6].
7. **`getAlbumsWithMissingArtwork()` silently caps at 1000**. See [R7].

---

## 1. Repository / Entry Point (`index.ts`)

### [R1] CRITICAL — `adoptItem` is not atomic

`index.ts:71-106`. The sequence is:

1. compute file_hash, 2. write tags, 3. move file, 4. recompute hash, 5. write item to DB, 6. handle cover art.

Failure between steps leaves observable bad state:
- write tags succeeds, move fails ⇒ file has new tags but DB never learns its path (or points at the old path).
- move succeeds, DB write fails ⇒ file is in canonical location, but is "unknown" to the system; next reconcile sees it as new and re-imports (potentially fingerprinting, hitting MB, etc.).

**Fix**:
- Wrap step 5 (DB write) and the move in a single SQLite transaction *and* perform the file move *last* (after DB has new row pointing at target path) using a **stage-then-commit** approach:
  1. Write tags to file (atomic via temp + rename — already done).
  2. Insert/update DB row with **the target path** (computed but not yet on disk).
  3. Rename the file to target path.
  4. If rename fails, rollback DB by deleting the row (or revert the path column).
- Alternative: Use a `transitioning` flag column to record the intended-state vs current-state, and let reconcile heal partial states.

**Why**: Violates the "Safe — no data loss" goal directly.

---

### [R3] HIGH — `MusicBrainzSource` enrichment is leaked in the sequential phase

`index.ts:412-440`. The "sequential until we have base metadata" loop does:

```ts
enrichedItem = data;
```

Subsequent sources operate on `enrichedItem`. If LocalTagsSource (sequential, first) supplies `artist+album`, MB is skipped from sequential and the merger runs over [tags, mb, lrclib, …] in parallel — correct.

But if LocalTagsSource returns nothing useful, the loop runs MB sequentially. Whatever MB returns is then used as the starting point for parallel sources, and the merger receives only the parallel sources' results. The `tags` and `mb` SourceResults are still pushed via `results.push(...)`, so merger sees them — but the parallel sources' input is already MB-tainted, meaning they may produce results derived from MB's enrichment, then *also* be merged with the same MB data. Double-counting + circular evidence.

**Fix**: Always call every source on the *original* item, never an enriched one. Run them in two waves only if a later wave's input strictly depends on an earlier one (MB → AcoustID is the only true dependency, and AcoustID is part of MB already). Otherwise, all in parallel and let merger combine.

---

### [R4] HIGH — `_resolveItem` checks for `merged.error` but `mergeData` never sets it

`index.ts:482-487` vs `merger.ts`. The "Failed to fetch data from sources" path is dead code. Either:
- Make `mergeData` actually return an error when no source produced data (replace the silent `return items[0]` at `merger.ts:11`), or
- Remove the dead branch and add an explicit check on `merged.data == null`.

---

### [R5] HIGH — `reconcile` Step 3 does an N+1 query on `getItemById` to discover `album_id`

`index.ts:241-247`. Inside the batch loop, every updated item does another round-trip to fetch `album_id`.

**Fix**: Change `getAllItemPaths()` to return `Map<path, { id, album_id }>` and source the album set in O(1) per row. Or do `SELECT DISTINCT album_id FROM items WHERE id IN (…) AND missing_since IS NOT NULL`.

---

### [R6] HIGH — Duplicate-check pre-filter is sequential, not parallel

`index.ts:264-271`. The loop awaits `checkForDuplicate(filePath)` one file at a time, which itself does file IO (parseFile) for mb_trackid and potentially `readFileSync` for the whole file. For 1M new files this is the slowest possible path.

**Fix**: Parallelize with a bounded queue (the same `concurrency` value as the importer). Use `p-limit` / `p-queue` / a simple chunked `Promise.all`.

---

### [R7] HIGH — `getAlbumsWithMissingArtwork()` silently caps at 1000

`albums.ts:233`. For a library with > 1000 missing covers, only 1000 are ever processed per run. The reconcile result reports `missingArtworkDetected: 1000`, which is misleading.

**Fix**: Either remove the LIMIT (paginate), or loop until empty, or document the cap and surface "more remaining" in the result.

---

### [R10] MEDIUM — `writeItemToDB` builds an `Album` from the *item*, then writes the album, then writes the item with the new `album_id`. This can merge two different albums

`index.ts:492-551`. `writeOrUpdateAlbum` matches by `mb_albumid` then by `(album, albumartist)`. Two real albums with identical title/artist (re-releases, compilations of singles) are silently merged into one row.

**Fix**: Always include `mb_albumid` in the match when present; fall back to `(album, albumartist, year)` or `(album, albumartist, country)`. Track which match strategy fired and log a warning when the secondary match merges differing `mb_albumid`s.

---

### [R11] MEDIUM — `item.added` is overwritten on every update

The temp item in `resolveItem(string)` sets `added: Date.now()`. When `writeOrUpdateItem` updates an existing row, it writes *all* columns, including `added`, clobbering the original add time.

**Fix**: Exclude `added` from the UPDATE column list, or compare and only update if not previously set.

---

### [R12] MEDIUM — `getAllItemPaths` returns *all* DB rows; in-memory filter to current `music_directory`

`index.ts:180-189`. For 1M tracks this is a 1M-row scan + a Map allocation + a Set allocation + a string `startsWith` per row.

**Fix**: Push the filter into SQL: `SELECT id, path FROM items WHERE substr(path, 1, ?) = ?`. Or maintain a `music_root_id` column. Also use a single `Set<string>` instead of both `Map` and `Set`.

Also the filter is bug-prone: `startsWith('/Users/daniel/Music')` matches `/Users/daniel/MusicVideos/…`. Add a trailing `/` to `musicDir` before comparison.

---

### [R15] LOW — Singleton via `Repository.getInstance` + `export default Repository.getInstance()`

`index.ts:555`. Default export is the instance, but the class is also exported and `getInstance` is a class method. Pick one — either an instance (`export default new Repository()`) or a class. Hide the singleton pattern behind a single function.

Better: don't use a singleton at all. The repository is a stateless coordinator; pass dependencies (sources, db, config) in via a factory. This makes testing trivial (Arch‑3).

---

## 2. Merger (`merger.ts`)

### [M5] HIGH — `hasConflict` only compares value[0] vs value[i]

`merger.ts:69-80`. If you have three sources reporting `["Beatles","Beetles","BTS"]`, the loop only checks `Beatles vs Beetles` (similar) and `Beatles vs BTS` (different → conflict). But the case where `value[0]` is the outlier (e.g. `["BTS","Beatles","Beetles"]`) marks a conflict on the first compare. The asymmetry produces inconsistent merges depending on input order.

**Fix**: Cluster values by normalized form, then pick the largest cluster. If multiple clusters and largest < 50% of sources, flag as a real conflict.

---

### [M7] HIGH — `resolveConflict` cannot represent "true conflict"

`merger.ts:136-215`. It always returns a value (highest score). There is no way to surface "couldn't decide" to the caller. Combined with [M9] this means conflicts disappear into the DB.

**Fix**: Return `{ value, confidence, isContested: boolean, candidates: Array<{ value, sources }> }`. Persist `isContested` rows into `sync_conflicts`.

---

### [M8] MEDIUM — `merged.data == null` guard at `merger.ts:16` is dead

`validItems` is filtered to `data != null` immediately above; `merged = validItems[0]` cannot have null data. Delete the branch.

---

### [M9] CRITICAL (vs README) — `sync_conflicts` table is never written to

README §"Conflict resolution flow" promises:
> `→ stored in sync_conflicts table → surfaced in UI as "needs review" → user picks: keep-db / keep-file / keep-mb / manual`

Schema exists (`db.ts:232-242`) but `mergeData` never INSERTs into it, and there is no `resolveConflict(id, resolution)` API surfaced. This is the most user-visible promise that's silently unimplemented.

**Fix**: Introduce `flagConflict(itemId, field, candidates)` called from the merger when [M7] returns `isContested: true`, and an API route `POST /api/conflicts/:id/resolve`.

---

### [M11] MEDIUM — `resolveGenres` ignores genres NOT in the tree

`merger.ts:328-341`. Genres absent from `genres-tree.yaml` are dropped with a "filtered out" log. A user-added custom genre (e.g. internal "to-relisten") disappears. This is OK as a *default*, but should be configurable.

**Fix**: Add `allow_custom_genres` config; if true, pass-through unknown genres into the result.

---

### [M12] LOW — `resolveGenres` only prefers Last.fm by source-name string

`merger.ts:226`: `if (source.sourceName !== 'LastfmGenreSource')`. Coupling to class name is brittle (renaming the class silently changes merge behavior).

**Fix**: Add a `sourceId: 'lastfm-genre'` string constant on the source class, and switch on that.

---

### [M13] LOW — `resolveGenres` uses `originalCasing` map keyed by normalized form, but later returns `Array.from(leafGenres)` mapped through the map

If a genre wasn't in `originalCasing` (because it was a parent expanded from the tree), the fallback returns the *normalized* (alphanumeric-only) form. For "Hip-Hop", that yields `hiphop` in the output. Looks ugly.

**Fix**: When inserting parents from the tree, also synthesize a default-cased "original" — title-case the tree key.

---

## 3. Sources

### [B2] HIGH — Module-level `lastRequestTime` for rate limiting is racy

`sources/musicbrainz/musicbrainz.ts:9-27`, `sources/discogs/discogs.ts:9-36`.

Under `Promise.all` of N concurrent requests:
- All read `lastRequestTime` ~simultaneously and see a stale value.
- All compute the same `waitTime`.
- All sleep that interval, then all set `lastRequestTime = Date.now()` and fire at once.

Effective rate limit: 1 burst per `MIN_REQUEST_INTERVAL`, not 1 per interval.

**Fix**: Use a proper queue, e.g. `p-queue` (referenced in README §Repository), with `concurrency: 1` and `interval: 1500` for MB. Or a tiny token-bucket. Or chain promises:
```ts
let chain: Promise<void> = Promise.resolve();
function nextSlot(): Promise<void> {
  const slot = chain.then(() => sleep(MIN_REQUEST_INTERVAL));
  chain = slot;
  return slot;
}
```

---

### [B3] HIGH — `fetchMusicBrainz` retries on `!response.ok` via the catch path

`musicbrainz.ts:142-157`. A 404 is `!response.ok`, falls into `throw new Error(...)`, the outer `catch` checks `retryCount < maxRetries` and retries. Result: a single missing recording does 10 retries with exponential backoff (up to ~17 minutes total wait if we hit 120s cap repeatedly).

**Fix**: Only retry on 5xx, 429, 503, and *network* errors. Distinguish:

```ts
if (response.status === 404) throw new NotFoundError(...);
if (!response.ok && !shouldRetry) throw new Error(`MB ${response.status}: ${await response.text()}`);
```

Then `catch` should only retry transient errors.

---

### [B4] HIGH — AcoustID API key is hard-coded

`sources/musicbrainz/acoustid.ts:140`: `client: 'XHzreNgplB'`. Secret leaked. Also a different one is commented out above.

**Fix**: Read from `globalConfig.acoustid_api_key`. Throw at startup if missing (rather than 401 mid-import).

---

### [B5] HIGH — `fpcalc` has no timeout

`acoustid.ts:73`. A broken file can hang the spawn indefinitely. Under `Promise.all`, that hangs the entire batch.

**Fix**:
```ts
const fpcalc = spawn(...);
const timer = setTimeout(() => fpcalc.kill('SIGKILL'), 30_000);
fpcalc.on('close', () => clearTimeout(timer));
```

---

### [B6] HIGH — `LastfmGenreSource` throws if API key is missing

`lastfm_genre.ts:17-19`:
```ts
if (globalConfig.lastfm_api_key === undefined) {
  throw new Error('LASTFM_API_KEY not set');
}
```

Hit by every track on a library where the user hasn't configured Last.fm. The repository catches it and pushes an `Import failed` error per file.

**Fix**: At config load, mark sources as `enabled: false` when their key is missing. Don't run disabled sources. Tell the user once at startup.

Same problem affects DiscogsSource (auth optional but the request still goes out), and any future API-key source.

---

### [B7] HIGH — Last.fm response `data.toptags.tag` can be a single object

When there's exactly one tag, Last.fm returns `tag: { name: ..., count: ... }`, not an array. The current code does `.tag ?? []` then `tags.map`. If it's an object, `.map` throws.

**Fix**:
```ts
const raw = data.toptags?.tag ?? [];
const tags = Array.isArray(raw) ? raw : [raw];
```

---

### [B8] HIGH — `DiscogsSource.getReleaseDetails` mixes master and release IDs

`discogs.ts:121-141`. Search returns either a `master` or a `release` result; IDs are in different namespaces (release `12345` ≠ master `12345`). The code tries `GET /masters/<id>` first, then `/releases/<id>` regardless of `result.type`.

**Fix**: Use `result.type` from search to pick the right endpoint. If type === 'master', try master only; if 'release', try release only.

---

### [B9] HIGH — Wikipedia source makes N+2 sequential API calls per item

`wikipedia.ts:124-151`. For each genre claim, an extra `wbgetentities` request, sequentially. No rate limit, no batching.

**Fix**: Wikidata supports `ids=Q1|Q2|Q3` (up to 50 per call). Batch the genre IDs into one request.

---

### [B10] MEDIUM — `getAcoustidFingerprint` uses `__dirname` heuristic with `'/ROOT'` substring

`acoustid.ts:63-71`. This is fragile and silently falls through to `process.cwd()`. Better: ship the binary as a resolved path via `import.meta.url` or a config setting.

---

### [B11] MEDIUM — `pickBestRelease` has unused `artistId` parameter

`musicbrainz.ts:194`. Dead parameter; also doesn't filter releases by artist (a song featured on multiple releases by different artists could pick the wrong one).

**Fix**: Either remove `artistId`, or actually filter `releases.filter(r => r['artist-credit']?.some(c => c.artist.id === artistId))` when artist is known.

---

### [B12] MEDIUM — `LocalTagsSource` falls through to `item.x` even when `common.x` is an empty string

`tags.ts:30-32` uses `||` which treats `""` as falsy. If a file has explicitly cleared its `title` tag, the source returns the previous (often empty) item title. Tag clears are not propagated.

**Fix**: Use `??` for nullish coalescing where empty string is a meaningful value. (Probably keep `||` for fields where empty means "not set" — but be explicit and consistent.)

---

### [B13] MEDIUM — `LocalTagsSource` date parsing on garbage

`tags.ts:44-48`: `new Date(common.date).getMonth() + 1` returns `NaN + 1 = NaN` when the date string is invalid. NaN then propagates into the DB as `month`.

**Fix**:
```ts
const date = common.date ? new Date(common.date) : null;
const validDate = date && !isNaN(date.getTime()) ? date : null;
month: validDate ? validDate.getMonth() + 1 : item.month,
```

---

### [B14] LOW — Sources have no retry budget on transient failures

`lrclib.ts`, `lastfm_genre.ts`, `discogs.ts`, `wikipedia.ts` all return `null`/`item` on first error. MusicBrainz has 10 retries; others have 0. Inconsistent.

**Fix**: A shared `withRetry(fn, { retries, backoff })` helper, used by all sources. Configurable.

---

### [B15] LOW — Sources mutate `item.genres` by lowercasing or dedup

`discogs.ts:143-150` (`mergeGenres`) lowercases. `wikipedia.ts:165-169` does the same. But the merger expects original casing for `originalCasing` map. The sources should produce *original-cased* genre strings and let the merger handle normalization.

---

## 4. Writeback (`writeback.ts`)

### [W3] HIGH — `writeTags` re-encodes / re-muxes the entire file via ffmpeg per write

`writeback.ts:150-159`. Even with `-c copy`, ffmpeg still does a full container rewrite (stream copy + remux). For a 50MB FLAC this is non-trivial IO + a temp file rename.

**Fix**: Use tag-level writers that touch only the metadata blocks:
- FLAC: `flac-tagger` (already in README's stack list, not currently used).
- MP3: `node-id3`.
- M4A: a dedicated mp4 atom writer.

This is the "Use the following libraries: music-metadata node-id3 flac-tagger" entry from REPO_README.md that hasn't been implemented yet.

Bonus benefit: per-format tag writing avoids ffmpeg's lossy or container-specific quirks.

---

### [W4] HIGH — `moveItem` parses the path template on every call

`writeback.ts:210`: `const nodes = parse((lex(globalConfig.path)))`. Lex+parse is pure for a given template string. Memoize at module load.

```ts
const PATH_NODES = parse(lex(globalConfig.path));
```

---

### [W5] HIGH — `evaluate` throws on undefined var, but `moveItem` only passes 4 vars

`writeback.ts:217-222`. If a user configures `path: '$albumartist/$year/$title'`, the evaluator throws because `$year` isn't in the vars map. The error propagates to `adoptItem`, the import aborts, the file is left where it was.

**Fix**: Build the vars map from the item dynamically:
```ts
const vars = {
  albumartist: item.albumartist || 'Unknown Artist',
  album: item.album || 'Unknown Album',
  artist: item.artist || 'Unknown Artist',
  title: item.title || 'Unknown Title',
  track: item.track ? String(item.track).padStart(2, '0') : '',
  year: item.year ? String(item.year) : '',
  // … etc, ideally synthesized from a `field → string` mapper that knows defaults
};
```

Better: validate the template at config load, listing required vars; refuse to start if unknown vars are used.

---

### [W6] HIGH — Path is not sanitized for filesystem-illegal characters

`writeback.ts:217-225`. A title containing `/`, `:`, `?`, `*`, `\0`, control chars, or trailing dots/spaces will break on at least one filesystem. macOS allows `:` in display name but stores it as `/`. Windows blocks `:?*<>|"`. Linux only blocks `/` and `\0`, but tools downstream may not.

**Fix**: Sanitize each path segment after evaluation:
```ts
function sanitizeSegment(s: string): string {
  return s
    .replace(/[\x00-\x1f]/g, '')       // control chars
    .replace(/[<>:"|?*\/\\]/g, '_')   // platform-illegal
    .replace(/\s+/g, ' ').trim()
    .replace(/[. ]+$/, '');             // no trailing dot/space
}
```

Also handle path length: NAME_MAX on most FS is 255 bytes; on macOS HFS+ the limit is 255 UTF-16 chars; ext4 is 255 bytes. Long unicode titles can exceed. Truncate per segment.

---

### [W7] MEDIUM — `buildMetadataArgs` filters `"undefined"` substrings

`writeback.ts:107`: `if (!strValue.includes('undefined'))`. A song literally titled `"Undefined"` is dropped. Brittle defensive coding hiding an upstream bug.

**Fix**: Don't do this. Find the *source* of `"undefined"` substrings (likely concatenation of `${item.x}` where `x` is undefined). Use guards at the source.

---

### [W8] MEDIUM — `writeBackItem` doesn't verify the file exists

`writeback.ts:193-200`. If the file was moved or deleted between resolveItem and adoptItem, ffmpeg fails opaquely and the temp file is cleaned up but the user sees a confusing log line.

**Fix**: `if (!fs.existsSync(item.path)) throw new FileMissingError(item.path)`.

---

### [W9] MEDIUM — `resolveBucket` throws on empty `value`

`writeback.ts:396`: `value[0].toUpperCase()`. If `value` is an empty string, throws TypeError. `callFunc` line 382 already has a fallback for empty `value` returning the last bucket — but the *callsite* in `moveItem` passes `vars[varName]`, and `albumartist || 'Unknown Artist'` ensures non-empty. Defense in depth: handle empty inside `resolveBucket`.

---

### [W10] LOW — `lex`/`parse` are home-grown and untested

`writeback.ts:267-349`. A handwritten lexer/parser for a config DSL is a maintenance liability. Consider:
- Reuse beets' grammar via a library port, or
- Replace with template literals: `path: '${alpha(albumartist)}/${albumartist}/${album}/${pad(track,2)} ${title}'` and a `Function`-constructed evaluator with whitelisted helpers.

Not urgent; current code works for the documented templates.

---

## 5. Cover Art (`coverart.ts`)

### [C1] HIGH — Cover art races between concurrent tracks of the same album

`adoptItem` calls `handleCoverArt(album)` if `!album.artpath`. With `concurrency: 10`, ten tracks of the same album simultaneously check `!album.artpath` and all fire fetches; only the last write wins. Multiple temp `.stripping` operations clash on the same files.

**Fix**: Serialize per `album.id`. A `Map<albumId, Promise<void>>` covers it:
```ts
const albumLocks = new Map<number, Promise<void>>();
async function withAlbumLock<T>(id: number, fn: () => Promise<T>): Promise<T> {
  const prev = albumLocks.get(id) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  albumLocks.set(id, next.finally(() => {
    if (albumLocks.get(id) === next) albumLocks.delete(id);
  }));
  return next;
}
```

---

### [C2] HIGH — External cover art *overwrites* extracted embedded art unconditionally

`coverart.ts:380-392`. The flow is: extract embedded → try external → use external if found. So a high-quality embedded cover is always overridden by iTunes' 600x600. iTunes 600x600 is JPEG-compressed and often lower fidelity than what the user shipped.

**Fix**: Compare resolutions or sizes. Or prefer extracted unless `external_cover_art_priority: true`. Or: only fetch external if no embedded was found.

---

### [C3] MEDIUM — `saveCoverArt` always writes `.jpg` regardless of actual format

`coverart.ts:329`. A PNG buffer is saved with `.jpg` extension. Some image viewers tolerate this, others don't.

**Fix**: Sniff the buffer (magic bytes for JPEG `FF D8 FF`, PNG `89 50 4E 47`) and use the correct extension. Or always convert to one format.

---

### [C4] MEDIUM — Cover fetch has no timeout

`coverart.ts:38-50`. `fetch` with no `AbortController` can hang.

**Fix**:
```ts
const ctrl = new AbortController();
const t = setTimeout(() => ctrl.abort(), 15_000);
try { return await fetch(url, { signal: ctrl.signal }); }
finally { clearTimeout(t); }
```

---

### [C5] MEDIUM — No size limit on downloaded covers

A malicious or misconfigured CDN could serve a huge image. Limit to e.g. 5MB.

---

### [C6] LOW — `hasEmbeddedCoverArt` + `extractEmbeddedCoverArt` both call `parseFile`

`coverart.ts:201-235`. Two reads of the same file metadata for the same answer.

**Fix**: Call `parseFile` once, return `{ has, buffer }`.

---

### [C7] LOW — `fetchFromItunes` URL builds `${artist}+${albumName}`

`coverart.ts:60`. `encodeURIComponent` doesn't encode `+`, so a literal `+` in the artist or album becomes a separator. Use `%20` or build via `URLSearchParams`.

---

### [C8] LOW — `getAlbumDirectory` uses only the first item

`coverart.ts:304-315`. Multi-disc releases often store discs in subdirectories. The cover ends up in disc 1's folder; disc 2 has no cover.jpg.

**Fix**: Write a `cover.jpg` in every directory that contains items of the album (or, write into the parent if all discs share one).

---

## 6. Reconcile Service (`reconcile-service.ts`)

### [S1] HIGH — Events fired *during* a reconcile are dropped

`reconcile-service.ts:155-160`. `runReconciliation` early-returns when `isReconciling`. The debounced watcher trigger therefore goes nowhere if a long scan is in progress. Worst case: a user adds 100 files while a full reconcile runs; those 100 files only get processed on the next *scheduled* run (60 min default).

**Fix**: Track "pending" reconcile requests. After the current run finishes, kick off another if pending was set.

```ts
private pendingReconcile = false;
private async runReconciliation() {
  if (this.isReconciling) { this.pendingReconcile = true; return; }
  this.isReconciling = true;
  try { /* … */ }
  finally {
    this.isReconciling = false;
    if (this.pendingReconcile) {
      this.pendingReconcile = false;
      setImmediate(() => this.runReconciliation());
    }
  }
}
```

---

### [S2] MEDIUM — `globalAny.__reconcileServiceInstance` is untyped, global state

`reconcile-service.ts:35-42`. Works for Next.js HMR but the `as any` hides type errors and leaks across modules.

**Fix**:
```ts
declare global { var __reconcileServiceInstance: ReconcileService | undefined; }
if (!globalThis.__reconcileServiceInstance) globalThis.__reconcileServiceInstance = new ReconcileService();
return globalThis.__reconcileServiceInstance;
```

---

### [S3] MEDIUM — `start()` is no-op when `isRunning` but doesn't reattach watcher

If `start()` was called once, then `stop()`, then `start()` again — the second `start()` sees `isRunning = true` (well, `false` after stop) — actually stop sets it false, fine. But the no-op guard means a caller can never replace settings without manually calling `stop()` first.

---

### [S4] MEDIUM — Hidden file regex `/(^|[\/\\])\../` excludes legitimate albums

`reconcile-service.ts:77`. A folder named `.50 Cent` or `..And You Will Know Us by the Trail of Dead` (well, no leading dot here but a dotted directory) would be ignored.

**Fix**: Only ignore `.DS_Store`, `.AppleDouble`, `Thumbs.db`, `.git`, `node_modules` — an allow-list of *known noise*, not a regex that catches anything dotted.

---

### [S5] LOW — `setMaxListeners(50)` is arbitrary

If more than 50 SSE clients are connected (admin dashboard with multiple browser windows), MaxListeners warning fires and breaks things. Either set Infinity or document the rationale.

---

### [S6] LOW — `awaitWriteFinish.stabilityThreshold: 2000` plus 10s debounce ⇒ minimum 12s lag

For a user copying one file into the library, that's twelve seconds before reconcile starts. Acceptable but worth documenting in the UX copy.

---

## 7. Database Layer (touched only because it's called from the repository)

### [D1] HIGH — `writeOrUpdateItem` queries `PRAGMA table_info` on every call

`items.ts:293`. The schema doesn't change at runtime. Memoize the column set once.

Same for `writeOrUpdateAlbum` at `albums.ts:169`.

---

### [D2] HIGH — `writeOrUpdateItem` and `writeOrUpdateAlbum` build a fresh SQL string every call

`items.ts:339, 350` and `albums.ts:205, 215`. `db.prepare` is cached by better-sqlite3/bun:sqlite, but the SQL string varies based on which columns happen to be present in the input object. Build a stable, full-column SQL once and use parameter binding for nulls.

---

### [D3] HIGH — No transaction around `writeItemToDB`

`index.ts:492-502`. Album write then item write. If item write fails, album exists with no tracks. Wrap in `db.transaction`.

---

### [D4] MEDIUM — `path BLOB` storage is unusual and forces Buffer ↔ string conversion everywhere

`db.ts:171` declares `path BLOB`. Item paths are UTF-8 strings; storing as BLOB doesn't help (UTF-8 collation in SQLite text is fine for `LIKE` and equality on macOS/Linux). The conversion taxes every read (`decodeRow`) and every write (`Buffer.from`). And it breaks straightforward SQL like `WHERE path LIKE 'X-Z/%'`.

**Fix**: Store as TEXT. Migrate existing rows.

Reason path was made BLOB is presumably to preserve byte-exact filenames including non-UTF8 byte sequences on Linux. If you actually need that (rare), keep BLOB and add a helper module that hides the conversion. Otherwise: TEXT.

---

### [D5] MEDIUM — `*_source` columns exist but aren't written or read anywhere

`db.ts:197-208`. README §"Data types" calls them out as critical. Schema has them. Code doesn't touch them. So:
- The merger can't know "the year came from MusicBrainz" → conflict resolution can't honor `keep-mb`.
- Future user edits can't be distinguished from imported values.

**Fix**: Carry a parallel `Record<keyof Item, DataSource>` through the merger; persist into `*_source` columns. (See Arch‑2.)

---

### [D6] LOW — Missing index on `marked_for_deletion`

Cleanup query at `items.ts:404-412` filters `WHERE marked_for_deletion IS NOT NULL AND marked_for_deletion < ?`. No index on the column. For 1M rows, this is a full scan.

**Fix**: `CREATE INDEX idx_marked_for_deletion ON items(marked_for_deletion) WHERE marked_for_deletion IS NOT NULL;` (partial index).

Same for `missing_since` (queried in many places implicitly via `checkAndUpdateAlbumMissingStatus`).

---

### [D7] LOW — `getAllItemPaths` doesn't stream

For 1M rows, materializing all into a Map allocates a lot of strings + Buffer-to-string conversions in JS. better-sqlite3's `iterate()` (Bun's `iterate` works similarly) would let reconcile process row by row.

---

## 8. Duplicate Check (`duplicate-check.ts`)

### [DC2] LOW — Silent fallback when metadata read fails

`duplicate-check.ts:49-53`. Returns `false` (treat as new) on any error. A corrupt file repeatedly imports as new on every reconcile.

**Fix**: At least skip the import path with a clear "skipped: unreadable" error pushed to `result.errors`.

---

## 9. Config (`lib/config.ts`)

### [CF1] HIGH — `compute_file_hash` env override is a coercion bug

`config.ts:89`:
```ts
compute_file_hash: process.env.COMPUTE_FILE_HASH === 'true',
```

If the env var is unset, this evaluates to `false`, which is treated as "explicitly false" and overrides the default `true`. The cleanup at lines 93-95 only deletes `undefined`, not `false`.

**Fix**:
```ts
compute_file_hash: process.env.COMPUTE_FILE_HASH === undefined
  ? undefined
  : process.env.COMPUTE_FILE_HASH === 'true',
```
Same applies to `reconcile_on_startup`.

---

### [CF2] MEDIUM — No validation of `path` template at startup

If `globalConfig.path` is invalid or references undefined vars (see [W5]), every import fails. Validate at startup, refuse to start with a clear error.

---

### [CF3] LOW — `getConfigPath` defaults to `'config.yaml'` (relative)

Means the working directory at startup determines the config. Surprising.

---

## 10. SSE API (`app/api/events/reconcile/route.ts`)

### [API1] LOW — Connection abort race

`route.ts:73`. If `request.signal` is already aborted before the handler runs (browser canceled the request just after sending it), `addEventListener('abort', cleanup)` never fires. Add:
```ts
if (request.signal.aborted) cleanup();
```

---

# Architectural Recommendations (patterns, invariants, non-representable bad states)

The bugs above mostly stem from a small number of structural issues. Fix the structure and large swathes of bugs become impossible.

## Arch-1 — `SourceResult` should be `Result<ScoredPartial<Item>, Error>`

Currently `DataSource.getData(item) → Promise<Item>` returns the *full* item, possibly the same one back, possibly modified. The merger then has to guess "did this source actually have anything?" by looking at non-null fields.

```ts
// Today: returning Item is ambiguous. ❌
abstract class DataSource {
  abstract getData(item: Item): Promise<Item>;
}

// Better:
type SourceResult<T> =
  | { ok: true; data: Partial<Item>; confidence: number; sourceId: string }
  | { ok: false; error: Error; sourceId: string };

abstract class DataSource {
  abstract readonly sourceId: string;
  abstract readonly enabled: boolean;
  abstract getData(item: Item): Promise<SourceResult<Item>>;
}
```

Benefits:
- "No data" is **non-representable** as a side-effect of returning the input item.
- The merger receives only the fields a source explicitly knows.
- Confidence is per-call (fixes [B1]).
- Errors are first-class (fixes the [B3]/[R8] error-vs-no-data confusion).
- `enabled` lets `LastfmGenreSource` opt out cleanly when no API key (fixes [B6]).

## Arch-2 — Carry source provenance through the merger and persist it

The schema already has `title_source`, `artist_source`, …, `genres_source`, etc., but no code touches them. Without source provenance, the README's `keep-mb` / `keep-file` conflict resolution **cannot be implemented**.

Concretely:

```ts
type MergedField<T> = { value: T; sourceId: string; confidence: number };
type MergedItem = { [K in keyof Item]: MergedField<Item[K]> };
```

The merger returns a `MergedItem`. A flatten step writes the columns + the matching `*_source` columns.

This also unlocks safe writeback: "only push to file the fields whose source is `database` (user-edited)", which is what "missing-only" should mean.

## Arch-3 — Drop the singleton; inject dependencies

`Repository.getInstance()` makes the repo a global. That's why we see:
- Module-level mutable state (`lastRequestTime`, `validGenres`)
- Hard-to-test top-level `start()` on import (`init.ts:10`)
- Race conditions on shared singletons ([B1])

Replace with:
```ts
function createRepository(deps: { db, config, sources, logger, queue }): Repository { … }
const repository = createRepository(defaultDeps());
```

Tests then construct a fresh repository with an in-memory DB and mock sources. The reconcile service receives the repository via its constructor.

## Arch-4 — Use a job queue with backpressure, not raw `Promise.all`

Reconcile uses `for (let i = 0; i < files.length; i += concurrency)` ad-hoc batching. This:
- Blocks on the slowest item per batch (one MB timeout stalls the whole batch).
- Doesn't share a rate limiter across sources.
- Has no retry / dead-letter handling.

`p-queue` (mentioned in REPO_README.md but not actually wired) gives:
- Smooth N-at-a-time concurrency (no batch stalls).
- Per-source rate limiting via separate queues.
- Pause/resume for backpressure.
- Promise per task you can cancel.

Suggested layout:
- `ImportQueue` (concurrency = 10): one task per file, runs the merger + writeback.
- `MusicBrainzQueue` (concurrency = 1, interval = 1500ms): all MB HTTP calls.
- `DiscogsQueue`, `WikipediaQueue`, etc.

Sources don't manage their own rate limit; they just `await queue.add(fn)`.

## Arch-5 — Replace `console.log` with a structured logger

The codebase uses `console.log`, `console.debug`, `console.error`, `console.warn` interchangeably. Examples:
- `merger.ts` prints a Levenshtein log line per comparison.
- `index.ts` prints summary lines that overlap with the SSE progress events.
- Errors and progress are indistinguishable in production.

Switch to a single logger (e.g. `pino`):
```ts
log.info({ event: 'reconcile.scanned', count: 1000 });
log.warn({ event: 'merge.conflict', field, candidates });
log.error({ event: 'import.failed', path, err });
```

Now operators can filter by `event:reconcile.*` and the SSE handler can stream the same events to UI.

## Arch-6 — Make bad states unrepresentable via the type system

A non-exhaustive list of bad states currently allowed by the types:

1. **`Item` with `id = 0`**. Used as a sentinel for "not yet in DB" (see `resolveItem(string)`). A real row never has id 0, but the type permits it. Introduce `NewItem` (no id) vs `PersistedItem` (with id). DB write returns `PersistedItem`.

2. **`SourceResult` with `data: Item | null` AND optional `error`**. Three states pretending to be two. Use the `Result<T, E>` ADT from Arch-1.

3. **`DataSource.confidence: number`** (mutable). Mark `readonly`. If it must vary per call, return it in the `SourceResult` (see Arch-1).

4. **`Item.path: string`** but DB stores BLOB. Inconsistency invites the `Buffer.from(path)` mistake (see `findExistingItem` at `items.ts:281`). If you keep BLOB, wrap with `function asPathKey(s: string): PathKey`.

5. **`Item.missing_since` + `marked_for_deletion`** are independent number-or-null columns. The valid combinations are:
   - `(missing_since=null, marked_for_deletion=null)`: present, healthy.
   - `(missing_since=N, marked_for_deletion=null)`: on disk gone, kept in DB.
   - `(missing_since=null, marked_for_deletion=N)`: user-deleted, in trash.

   `(missing_since=N, marked_for_deletion=N)` is currently representable but undefined. Use a discriminated union:
   ```ts
   type ItemLifecycle =
     | { state: 'present' }
     | { state: 'missing'; since: number }
     | { state: 'trashed'; since: number };
   ```
   Stored as a single `lifecycle_state` column + a single `lifecycle_since` column, or kept as two columns with a CHECK constraint:
   ```sql
   CHECK (missing_since IS NULL OR marked_for_deletion IS NULL)
   ```

6. **`globalConfig.path`** is a free-form string parsed at runtime. Validate eagerly: when config loads, evaluate the template against a dummy item and assert success.

7. **`item.added`** is `number` (epoch ms). On update, the *new* added is silently passed through. Either make it `readonly` in `Item` after first persist (split types again) or excluded from the UPDATE column list at the DB layer.

8. **Genres**: `Item.genres: string[] | null`, `Album.genres: string | null` — different shapes. Pick one (probably `string[]`) and convert at the DB boundary.

## Arch-7 — Define and enforce invariants

Document and assert these where they apply:

| Invariant | Where to enforce |
|---|---|
| Every persisted `Item.path` exists or has `missing_since != null`. | After `adoptItem`; in reconcile step 3. |
| Every persisted `Item` has `album_id != null`. | DB CHECK constraint (or default to a "unassigned" album). |
| Album row exists for every `(album, albumartist)` pair referenced by an item. | FK already enforces; just don't `ON DELETE SET NULL`. |
| If `marked_for_deletion != null`, the file path starts with `globalConfig.trash_directory`. | Add to `_resolveItem` and `markItemForDeletion` postconditions. |
| `mb_trackid`, when present, is unique across non-deleted items. | DB unique partial index: `CREATE UNIQUE INDEX uniq_mb_trackid ON items(mb_trackid) WHERE mb_trackid IS NOT NULL AND marked_for_deletion IS NULL;` |
| `file_hash`, when present, matches the actual file. | Compute hash *after* writeback in `adoptItem`. |
| `SourceResult.data` keys ⊆ keys the source declared it can provide. | Source contract; assert in dev mode. |
| Confidence ∈ [0, 1]. | Constructor invariant on `DataSource`. |

## Arch-8 — Cache schema introspection + load-once side data

A list of things that should be loaded once and reused:
- Schema `PRAGMA table_info(items|albums)` ([D1]).
- `genres-tree.yaml` ([M10]).
- `genres.txt` ([already cached in instance, just confirm singleton]).
- Path-template lex/parse ([W4]).
- ffmpeg path resolution (`coverart.ts`, `writeback.ts` both probe on every call).

A small `lib/music/repository/cache.ts` with memoized getters keeps this tidy.

## Arch-9 — Tests, even just one happy-path + one conflict path

There are zero tests in the repository folder (one `test-coverart.ts` exists; it's a script). Specific suggestions:

- **Merger**: golden-file tests for known multi-source combinations. Especially regression tests for [M3], [M5], [M9].
- **Path template**: unit tests for `lex/parse/evaluate` covering nested vars, missing vars, custom buckets.
- **Reconcile**: integration test with a tmp directory, in-memory SQLite, mocked sources. Add a "kill MB mid-import" case.
- **Adopt atomicity**: induce failure at each step and check DB & FS consistency.

## Arch-10 — Naming and small things worth fixing while touching the code

- `LocalTags` interface is marked `// FIXME: remove LocalTags because Technical debt :(`. Remove it now while you're refactoring sources.
- `Recording` interface in `musicbrainz.ts` is converted to `Item` shape inside `MusicBrainzSource.getData`. Skip the intermediate type — return `Partial<Item>` directly.
- The `ScoredTrackData`, `TrackData` in README types section vs the actual `Item` in code are out of sync. Either align README to code or move the README types into a `types.ts` and use them.
- `REPO_README.md` lines 161-165 are notes-to-self bleeding into the doc. Clean up.
- `repository/test-coverart.ts` should move to a `scripts/` folder.

---

# Suggested Action Order for Sonnet 4.5

If you have time for one PR, do **B1, M3, W1, R2** — they are correctness fixes with small surface area.

If you have time for two:
- PR 1 (correctness): B1, M3, W1, R2, M9 (conflict persistence), R1 (adoptItem atomicity), DC1 (hash streaming).
- PR 2 (perf + architecture): Arch-1 (source result type), Arch-4 (real queue), M10/M4 (merger perf), D1/D2 (schema caching), W2/W3 (async writeback + per-format tag writers).

Refactors like Arch-6 (non-representable bad states) and Arch-9 (tests) are best done as ongoing changes alongside each touched module — don't try to land them all at once.

Each section above is structured so you can lift a single finding and address it independently. When you do, update or remove its entry here.

---

# Second-Pass Review (post Sonnet 4.5 fixes)

After re-reading the code following the fixes in the Implementation Summary, this section captures:

1. **Regressions introduced by the fixes** themselves.
2. **Issues missed in the first pass** that became visible on re-read.

Each item uses a `NEW-*` prefix so it doesn't collide with the existing finding IDs.

## Regressions from the fixes

### [NEW-M14] CRITICAL — `length` (audio duration) now silently prefers MusicBrainz over the decoded file

`merger.ts:134-138`. The [M3] fix routes all numeric fields through "pick by max confidence". `length` is a number. MusicBrainzSource (0.85) outranks LocalTagsSource (0.6), so `length` is now whatever MB's "recording.length" says — typically the original studio length, **not** the actual file's decoded duration.

REPO_README.md §Merger explicitly says:
> Duration should be preferred [as] the actual audio length of the recording instead of music brainz.

The previous bug was "all numbers silently dropped except the first source's"; the new bug is "MB always wins for numbers." This is now incorrect for `length` specifically (and arguably for `bitrate`, `samplerate`, `bitdepth`, `channels`, all of which only LocalTagsSource can know).

**Fix**: Field-specific override registry.
```ts
const FIELD_OVERRIDES: Record<string, 'maxConfidence' | 'audioOnly' | 'sum' | …> = {
  length: 'audioOnly',
  bitrate: 'audioOnly',
  samplerate: 'audioOnly',
  bitdepth: 'audioOnly',
  channels: 'audioOnly',
  // …
};
```
Where `audioOnly` means "ignore anything that didn't come from LocalTagsSource or ReplayGain."

**Why this is Critical**: ReplayGain calculations and gapless playback depend on accurate `length`. Player UIs that show a progress bar at MB's `length` while the file's `length` differs will be off by seconds.

---

### [NEW-M15] HIGH — Array union destroys credit order

`merger.ts:142-146`. The [M3] fix merges arrays with `[...new Set(allArrayValues)]`. For `artists: ["John Lennon", "Paul McCartney"]` from one source vs `["Paul McCartney", "John Lennon"]` from another, the dedup yields one of the two orderings nondeterministically (depends on `flatMap` iteration order over `valuesWithSource`).

Lead-artist position is semantically meaningful (used for "main artist" filtering, royalty, alphabetical sort, etc.). Losing it breaks queries like `WHERE artist = 'first credited artist'`.

**Fix**:
- For "ordered credit" arrays (`artists`, `artists_ids`, `albumartists`, `albumartists_ids`, `composers`, `composers_ids`, `arrangers`, `arrangers_ids`, `lyricists`, `lyricists_ids`, `remixers`, `remixers_ids`), pick the *whole array* from the max-confidence source, not a union.
- Genre-like unordered arrays (`genres`, `styles`) can stay as union.

In type terms: introduce `OrderedList<T>` vs `Set<T>` semantics per field.

---

### [NEW-M16] MEDIUM — Array union ignores source confidence entirely

`merger.ts:142-146`. Even for unordered arrays, dropping confidence means a low-confidence source (Wikipedia 0.65) can inject genres that a high-confidence source (Last.fm 0.7) didn't endorse. There's no minimum-confidence floor or weighting.

**Fix**: When unioning, only include arrays from sources whose confidence ≥ threshold, OR weight per-element occurrences by source confidence and keep above a cutoff.

---

### [NEW-B16] HIGH — `acoustIdScore` is no longer used at all (B1 fix lost a signal)

The [B1] fix removed the mutation but didn't relocate the per-call confidence. `acoustIdScore` is still received from AcoustID (`recording.acoustIdScore`) but is now completely unused (`musicbrainz.ts:271` writes it to the Recording, never read by anyone). The merger therefore treats a 0.99-score AcoustID hit the same as a 0.51-score hit.

This regresses one of the original design intents documented in REPO_README.md (`MusicBrainz (confidence: 0.85, adjusted by AcoustID score)`).

**Fix**: As a stop-gap until [Arch-1] lands, return the per-call confidence in `SourceResult` from `fetchFromAllSources` rather than reading `source.confidence`. `MusicBrainzSource.getData` then returns its computed score alongside the data via an internal contract:
```ts
async getData(item: Item): Promise<{ data: Item; confidenceOverride?: number }> { … }
```
Or skip the partial fix and go straight to [Arch-1].

**Why this matters now**: low-quality fingerprint matches (AcoustID score < 0.7) are common for short tracks, live recordings, and remasters. Treating them as full-confidence MB hits pollutes the merger.

---

### [NEW-W11] MEDIUM — `execFileAsync` has no timeout

`writeback.ts:162`. The [W2] fix moved off `execFileSync`, but `execFileAsync(ffmpeg, args, { maxBuffer: 10 * 1024 * 1024 })` has no `timeout` option. A hung ffmpeg (corrupt file, stuck filter) now hangs an async slot indefinitely. Under `Promise.all` concurrency=10, one bad file silently consumes a slot for the lifetime of the process.

**Fix**:
```ts
await execFileAsync(ffmpegPath, args, {
  maxBuffer: 10 * 1024 * 1024,
  timeout: 60_000,  // 60s should be plenty for a metadata-only rewrite
  killSignal: 'SIGKILL',
});
```

Same applies to `coverart.ts` strip ffmpeg invocation if/when it's converted to async.

---

### [NEW-W12] LOW — Sync filesystem calls remain inside async `writeTags`

`writeback.ts:165`, `writeback.ts:170-172`. The function is now `async` but `fs.renameSync`, `fs.existsSync`, `fs.unlinkSync` still block. The point of the [W2] fix was to free the event loop; these blocking calls partially defeat it.

**Fix**: Switch to `fsPromises.rename`, `fsPromises.unlink`, and `fsPromises.access`. Same nit applies in `coverart.ts` and `index.ts:moveFile`.

---

### [NEW-M17] LOW — Dead branch still present after fix

`merger.ts:78-87`. The fallback to `validItems[1]` when `merged.data == null` cannot execute: `validItems` was just filtered to `data != null` two lines earlier. Same dead-branch flag as [M8]; the [M1] fix didn't remove it.

**Fix**: Delete lines 78-87.

---

### [NEW-M18] LOW — Cache load race on first request

`merger.ts:14-61`. `genresTreeCache` and `parentMapCache` are lazily loaded with no lock. Two concurrent first-time calls will both pass the `if (!genresTreeCache)` check, both read the YAML, both build the map, and the second one's write wins. Functionally identical result, but doubles startup work.

**Fix**: Eager-load at module import (top-level `const`), or wrap in a `Promise` so concurrent callers share the same load:
```ts
let genresTreeCachePromise: Promise<any> | null = null;
function getGenresTree(): Promise<any> {
  if (!genresTreeCachePromise) {
    genresTreeCachePromise = fs.promises.readFile(/* … */).then(yaml.load);
  }
  return genresTreeCachePromise;
}
```

---

### [NEW-M19] LOW — Re-sort inside per-key loop is wasted work

`merger.ts:136, 140, 185, 194`. After [M2] sorted `validItems` by confidence descending, `valuesWithSource[0]` is *already* the highest-confidence non-null value for the key. The repeated `[...valuesWithSource].sort((a, b) => b.confidence - a.confidence)[0]` is equivalent to `valuesWithSource[0]`. For N keys this is N extra sorts.

**Fix**: Just use `valuesWithSource[0].value` for the "max confidence" cases. Keep the explicit sort *only* in the genres / string-conflict-resolution paths if they actually need to filter first.

---

## Issues missed in first pass

### [NEW-B17] HIGH — `ReplayGain` source is never used

`sources/replaygain.ts:100-131` defines the class. It is exported and `extends DataSource`. But the `dataSources` array in `index.ts:19-26` does **not** include it:

```ts
private readonly dataSources: DataSource[] = [
    new LocalTagsSource(),
    new MusicBrainzSource(),
    new LrclibSource(),
    new DiscogsSource(),
    new LastfmGenreSource(),
    new WikipediaSource(),
    // ReplayGain — missing
];
```

So `r128_track_gain`, `rg_track_gain`, `rg_track_peak` are never computed. The README and schema both expect these columns; the columns sit `NULL` forever.

**Fix**: Register `new ReplayGain()` in the array. Be mindful that it spawns ffmpeg and is therefore expensive — should probably be confidence-gated or skipped for tracks already in DB with non-null gain values.

---

### [NEW-R16] CRITICAL — `itemToAlbum` overwrites album's `added` timestamp on every track import

`index.ts:498-543`, particularly line 542: `added: item.added`. When a *new* track is imported into an *existing* album, `writeOrUpdateAlbum` UPDATEs the existing album row, writing the new item's `added` (which is `Date.now()` from the temp item in `resolveItem(string)`). The album's true "first track added" timestamp is silently overwritten on every subsequent track import.

Symptoms users will notice:
- `getAllAlbums()` `ORDER BY added DESC` (`albums.ts:60`) — albums hop to the top whenever any track is added.
- "Recently added" UI is wrong.

**Fix**: In `writeOrUpdateAlbum`, when an existing album row is found, drop `added` from the UPDATE column list (preserve the original timestamp). Or in `itemToAlbum`, return `added: undefined` and let `writeOrUpdateAlbum` only set it on INSERT.

This is the album-side counterpart of [R11] (item.added). Same fix shape.

---

### [NEW-A1] HIGH — Album lookup with `WHERE album = ? AND albumartist = ?` does not match NULL

`albums.ts:178`. SQL `column = NULL` is always false; you need `IS NULL`. When `item.album` is `null` (rare but possible — files without album tags), the fallback match returns no row, `writeOrUpdateAlbum` falls into the INSERT branch, and **a new row is created on every reconcile** for the same "unknown album".

**Fix**:
```ts
existing = db.prepare(`
  SELECT id FROM albums
  WHERE (album IS NULL AND ? IS NULL OR album = ?)
    AND (albumartist IS NULL AND ? IS NULL OR albumartist = ?)
`).get(album.album, album.album, album.albumartist, album.albumartist);
```

Or normalize: refuse to write an album with NULL `album` or `albumartist` (use `'Unknown Album'` / `'Unknown Artist'` sentinels — pattern already used in `writeback.ts:226-229`).

**Why this is High**: untagged tracks accumulate ghost albums on every reconcile run. Over weeks this becomes a measurable number of orphan rows.

---

### [NEW-CV1] HIGH — `handleCoverArt` writes the in-memory album back, clobbering concurrent updates

`coverart.ts:404-408`. After saving the cover, the code does `album.artpath = coverPath; writeOrUpdateAlbum(album)`. The `album` object was loaded earlier in the call; if any other concurrent reconcile (different track in same album, retry, manual trigger) wrote new fields to the album row, those writes are now overwritten by this stale snapshot.

Combined with [C1] (no per-album lock), this is a lost-update bug: two concurrent imports may each call `handleCoverArt(album)` with their own snapshots; whichever finishes last wins, the other's tag edits / metadata enrichment to the album columns are erased.

**Fix**:
- Don't pass full album objects through `writeOrUpdateAlbum`. Add a focused `updateAlbumArtpath(albumId, coverPath)` that issues `UPDATE albums SET artpath = ? WHERE id = ?` only.
- More generally: per-album mutex (already recommended in [C1]).

---

### [NEW-CF4] MEDIUM — `globalConfig.music_directory` is normalized ad-hoc at every consumer

Grep for `globalConfig.music_directory.replace('~'` and `endsWith('/')` — at least 4 sites (`index.ts:181`, `reconcile-service.ts:72`, `writeback.ts:220-221`, `enumerate.ts:10-11, 54-55`) each do their own normalization. They are *not* consistent — some add trailing `/`, some don't; some expand `~`, some assume already expanded.

This is the source of bugs like [R12] (path startsWith mismatch when one side has trailing slash and the other doesn't).

**Fix**: Normalize once at config load. Replace `globalConfig.music_directory` with a getter that returns a fully resolved, trailing-`/` absolute path. Same for `trash_directory`.

---

### [NEW-D8] MEDIUM — `writeOrUpdateAlbum` overwrites `added` on UPDATE

`albums.ts:194-207`. Mirrors [R11] (items) and [NEW-R16] (which is the higher-level symptom). When updating, `Object.keys(dbAlbum)` includes `added`, so the column is in the SET list. Same fix: exclude `added` from UPDATE.

This is the structural bug; [NEW-R16] is what users will see.

---

### [NEW-D9] LOW — `migrations` table exists but is unused

`db.ts:245-249` defines `CREATE TABLE IF NOT EXISTS migrations …`. No code INSERTs into it. Schema changes are applied via `CREATE TABLE IF NOT EXISTS` in `createSchema`, which means existing databases never get *new columns* added. New columns (like `*_source`, `file_hash`, `marked_for_deletion`) appear only on databases created after the column was added to the schema.

**Fix**: Implement a real migration runner:
```ts
const MIGRATIONS = [
  { name: '001_initial', table: 'items', sql: '…' },
  { name: '002_add_source_columns', table: 'items', sql: 'ALTER TABLE items ADD COLUMN title_source TEXT;' },
  // …
];

function runMigrations(db) {
  for (const m of MIGRATIONS) {
    if (!db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(m.name)) {
      db.exec(m.sql);
      db.prepare('INSERT INTO migrations VALUES (?, ?)').run(m.name, m.table);
    }
  }
}
```

Without this, existing user databases will silently lack `*_source` columns even after [Arch-2] is implemented.

---

### [NEW-DC2] MEDIUM — `duplicate-check.ts` still uses `readFileSync` for the entire file

`duplicate-check.ts:36`. Mentioned in [DC1] but worth re-flagging post-review: the existing fix list shows this as still open. With concurrent reconcile, 10 files × 100MB = 1GB resident memory just for hashing. Use the existing streaming `computeFileHash` from `utils/hash.ts`.

---

### [NEW-S7] LOW — `lex` cannot escape `$` or `%` in path templates

`writeback.ts:281-282`. If a user wants a literal `$` or `%` in their path template (rare but valid — e.g., a directory named `100%`), there's no escape mechanism. The lexer always treats them as tokens.

**Fix**: Add `\$` → literal `$` and `\%` → literal `%` to `lex`.

---

### [NEW-W13] LOW — `moveItem` doesn't sanitize the result and can produce empty path segments

`writeback.ts:225-233`. If `item.albumartist` is empty and the template includes `$albumartist`, the fallback `'Unknown Artist'` saves the day. But if it's e.g. `'   '` (whitespace), the regex `.replace(/\/\s+/g, '/')` removes the spaces, producing `…//Album/…` (consecutive slashes). On most OS this is collapsed transparently; on Windows or some FUSE filesystems it isn't.

**Fix**: After evaluation, split on `/`, sanitize each segment (see [W6]), rejoin. Replace empty segments with their default fallback.

---

### [NEW-T2] MEDIUM — `Item.source` is a free-form string with no enum

`items.ts:7` declares `source: string`. The temp item in `index.ts:58` sets it to `'test'`. There is no documented set of valid sources; no migration; nothing prevents callers from putting anything in this column.

**Fix**: Make it a string-literal union: `type ItemSource = 'imported' | 'user' | 'reconcile' | …`. Default value in `resolveItem(string)` should be `'imported'`, not `'test'`.

---

### [NEW-R17] LOW — `resolveItem(string)` builds a temp item with semantic noise

`index.ts:52-63`. The temp item has `id: 0` (sentinel), `source: 'test'` (debug placeholder), `added: Date.now()` (gets clobbered by source mutations or persisted incorrectly if no source overrides it). This is exactly the kind of "default-constructed bad state" that [Arch-6] warns about.

**Fix**: Introduce a `NewItem` type without `id`, with sensible defaults supplied by the constructor:
```ts
type NewItem = Omit<Item, 'id' | 'album_id'> & { id?: never; album_id?: never };
function newItemFromPath(path: string): NewItem { … }
```

Then `_resolveItem(NewItem | Item)` becomes type-safe and `id: 0` is non-representable.

---

### [NEW-S8] MEDIUM — Reconcile service watcher persists `pathExistsStmt` prepared once at start

`reconcile-service.ts:87`. The prepared statement is created in `start()`. If the DB connection is replaced (HMR, settings reload), the statement holds a reference to the old connection. Reads either fail or read stale data.

**Fix**: Either prepare on every event (better-sqlite3 caches them anyway) or reset on DB swap. In practice this is unlikely to bite unless the DB module's `db` export is ever re-assigned — which today it isn't, but the design is fragile.

---

### [NEW-DB1] MEDIUM — `writeOrUpdateItem` re-reads schema on every call

`items.ts:293`. `PRAGMA table_info(items)` is called per item. For 1M files in a reconcile, that's 1M extra round-trips for an *immutable* result. Mentioned in [D1] — flagging again because nothing changed.

**Fix**: Cache `validColumns` at module load.

---

### [NEW-AL1] LOW — `getAlbumsWithMissingArtwork` ordering is undefined

`albums.ts:228-234`. No `ORDER BY`. SQLite chooses arbitrary order. Combined with the `LIMIT 1000` from [R7], which 1000 albums get processed per reconcile is nondeterministic — a small set may starve indefinitely if 1001+ exist.

**Fix**: `ORDER BY added DESC` (process newest first), or `ORDER BY id` (process oldest first), and paginate when count > 1000.

---

### [NEW-FS1] LOW — `enumerateMusicFilesStream` does not yield on `EACCES` or symlink loops

`utils/enumerate.ts:60-79`. Catches and logs `readdir` errors but doesn't yield anything. If a single subdirectory is unreadable, the entire stream loses every file in *and below* it without warning. Also no symlink-cycle protection.

**Fix**: Track inodes (or paths via `realpath`) to detect cycles; surface per-directory errors via a side channel (event or accumulator) so reconcile can report them.

---

### [NEW-RG1] LOW — `genres-tree.yaml` lookup uses `process.cwd()` from anywhere

`merger.ts:16`. Lots of file lookups assume `process.cwd()` is the project root. In a deployed binary (Bun build, packaged app) `cwd` can be set to the user's home. Same flag for `lastfm_genre/genres.txt` (`lastfm_genre.ts:34`) and `binaries/chromaprint/fpcalc` (`acoustid.ts:70`).

**Fix**: Use `import.meta.url` + `fileURLToPath` to resolve relative to the module file, or bundle the YAML/text via `import`.

---

## Updated severity tally (after fixes + this re-review)

| Severity | First pass | After fixes | New in 2nd pass | Net open |
|---|---|---|---|---|
| Critical | 5 | 1 deferred (R1) | NEW-M14, NEW-R16 | 3 |
| High | ~20 | unchanged | NEW-M15, NEW-B16, NEW-B17, NEW-A1, NEW-CV1 | ~25 |
| Medium / Low | rest | unchanged | NEW-M16, NEW-W11, NEW-W12, NEW-CF4, NEW-D8, NEW-D9, NEW-DC2, NEW-S7, NEW-S8, NEW-W13, NEW-T2, NEW-R17, NEW-DB1, NEW-AL1, NEW-FS1, NEW-RG1 | + |

## Recommended next-PR order

1. **NEW-M14** (`length` field-specific override) — short blast radius, fixes a user-visible regression of the [M3] fix.
2. **NEW-R16 + NEW-D8** (album `added` preservation) — one-line UPDATE-column exclusion, fixes "albums always show as newest".
3. **NEW-B17** (register ReplayGain in dataSources) — one-line fix, restores a documented feature.
4. **NEW-A1** (NULL-safe album lookup) — prevents accumulation of ghost albums.
5. **NEW-CV1** (focused `updateAlbumArtpath`) — closes a lost-update window.
6. **NEW-W11** (ffmpeg timeout) — prevents hung imports under concurrency.
7. **NEW-M15 / NEW-M16** (ordered vs unordered array merging) — once the field-type-strategy from NEW-M14 lands, fold these in.
8. **NEW-CF4** (config normalization) — small, removes a class of path-comparison bugs.
9. **NEW-D9** (migration runner) — required before [Arch-2] can be deployed safely.

Items NEW-M17 / NEW-M18 / NEW-M19 / NEW-W12 / NEW-S7 / NEW-W13 / NEW-T2 / NEW-R17 / NEW-DB1 / NEW-AL1 / NEW-FS1 / NEW-RG1 can be tackled opportunistically as code is touched for other reasons.
