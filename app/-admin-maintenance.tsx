import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import Heatmap, { type HeatmapData } from "@/components/ui/heatmap";
import {
    useLibrarySync,
    PHASE_LABELS,
    type SyncLogEntry,
    type ReconcileItemError,
} from "@/hooks/use-library-sync";
import { cn } from "@/lib/utils";
import { Loader2, AlertTriangle, Play, Undo2 } from "lucide-react";

// ---- Dedup types ----
type DedupMerged = { id: number; album: string | null; albumartist: string | null };
type DedupGroup = {
    key: string;
    canonicalId: number;
    canonicalAlbum: string | null;
    canonicalArtist: string | null;
    merged: DedupMerged[];
};
type DedupReport = {
    dryRun: boolean;
    groupsFound: number;
    albumsMerged: number;
    itemsReassigned: number;
    namesRestored: number;
    groups: DedupGroup[];
};

// ---- Refetch types ----
type RefetchPreview = {
    count: number;
    items: Array<{
        id: number;
        path: string;
        title: string | null;
        artist: string | null;
        year: number | null;
    }>;
};
type RefetchDetail = {
    itemId: number;
    path: string;
    oldAlbumId: number | null;
    newAlbumId: number | null;
    filledFields: string[];
    error?: string;
};
type RefetchReport = {
    probed: number;
    enriched: number;
    relinked: number;
    failed: number;
    details: RefetchDetail[];
};

// ---- Trash types ----
type TrashedAlbum = {
    id: number;
    album: string;
    albumartist: string;
    year: number | null;
    artpath: string | null;
    marked_for_deletion: number;
    itemCount: number;
};
type TrashedItem = {
    id: number;
    title: string | null;
    artist: string | null;
    album: string | null;
    album_id: number | null;
    path: string;
    marked_for_deletion: number;
};
type TrashResponse = { albums: TrashedAlbum[]; items: TrashedItem[] };

function relTime(ts: number | null | undefined): string {
    if (!ts) return "never";
    const diff = Date.now() - ts;
    if (diff < 60_000) return "just now";
    const min = Math.round(diff / 60_000);
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.round(hr / 24);
    return `${day}d ago`;
}

function fmt(n: number | null | undefined): string {
    return (n ?? 0).toLocaleString();
}

// ---- Layout primitives ---------------------------------------------------

function Pane({
    title,
    summary,
    actions,
    children,
    className,
}: {
    title: string;
    summary?: React.ReactNode;
    actions?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <section
            className={cn(
                "rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-5 md:p-6",
                className,
            )}
        >
            <header className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-baseline gap-3 min-w-0">
                    <h2 className="text-[11px] uppercase tracking-[0.14em] text-white/55 font-medium whitespace-nowrap">
                        {title}
                    </h2>
                    {summary && (
                        <span className="text-xs text-white/45 tabular-nums truncate">
                            {summary}
                        </span>
                    )}
                </div>
                {actions && <div className="flex items-center gap-1 flex-shrink-0">{actions}</div>}
            </header>
            {children}
        </section>
    );
}

function SubLabel({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <p
            className={cn(
                "text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium mb-2",
                className,
            )}
        >
            {children}
        </p>
    );
}

function KV({
    label,
    value,
    valueClass,
    labelWidth = "w-24",
}: {
    label: string;
    value: React.ReactNode;
    valueClass?: string;
    labelWidth?: string;
}) {
    return (
        <div className="flex items-baseline gap-3 text-sm">
            <span
                className={cn(
                    "text-[11px] uppercase tracking-[0.14em] text-white/40 font-medium flex-shrink-0",
                    labelWidth,
                )}
            >
                {label}
            </span>
            <span className={cn("text-white/85 min-w-0 flex-1 truncate", valueClass)}>{value}</span>
        </div>
    );
}

function StatGrid({
    items,
    columns = 4,
}: {
    items: Array<{ label: string; value: React.ReactNode; tone?: "ok" | "warn" | "muted" }>;
    columns?: number;
}) {
    const toneClass = (t: "ok" | "warn" | "muted" | undefined) =>
        t === "ok"
            ? "text-emerald-300"
            : t === "warn"
                ? "text-amber-300"
                : t === "muted"
                    ? "text-white/55"
                    : "text-white";
    return (
        <dl
            className="grid gap-x-6 gap-y-2 text-sm"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
            {items.map((it) => (
                <div key={it.label} className="flex flex-col">
                    <dt className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium">
                        {it.label}
                    </dt>
                    <dd className={cn("tabular-nums font-medium", toneClass(it.tone))}>{it.value}</dd>
                </div>
            ))}
        </dl>
    );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2 text-sm text-red-300 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{children}</span>
        </div>
    );
}

function Description({ children }: { children: React.ReactNode }) {
    return <p className="text-xs text-white/55 mb-4 leading-relaxed">{children}</p>;
}

function ActionButton({
    children,
    onClick,
    disabled,
    busy,
}: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    busy?: boolean;
}) {
    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            disabled={disabled || busy}
            className="h-7 px-2.5 text-xs gap-1.5"
        >
            {busy && <Loader2 className="w-3 h-3 animate-spin" />}
            {children}
        </Button>
    );
}

// ---- GitHub-style commit log --------------------------------------------

type LogItem = {
    id: number;
    timestamp: number;
    dotClass: string;
    title: React.ReactNode;
    titleClass?: string;
    meta?: React.ReactNode;
    secondary?: React.ReactNode;
};

function CommitLog({ items, empty }: { items: LogItem[]; empty: string }) {
    if (items.length === 0) {
        return <p className="text-xs text-white/45">{empty}</p>;
    }
    return (
        <ol className="relative pl-1">
            {/* connector line behind all dots */}
            <div className="absolute left-[7px] top-3 bottom-3 w-px bg-white/[0.06]" aria-hidden />
            {items.map((it) => (
                <li key={it.id} className="relative grid grid-cols-[14px_1fr_auto] gap-3 py-1.5">
                    <span
                        className={cn(
                            "relative z-10 w-2.5 h-2.5 rounded-full mt-1.5 ring-[3px] ring-[#0c0c0c]",
                            it.dotClass,
                        )}
                    />
                    <div className="min-w-0">
                        <div className="flex items-baseline gap-2 min-w-0">
                            <span
                                className={cn(
                                    "text-sm text-white/85 truncate",
                                    it.titleClass,
                                )}
                            >
                                {it.title}
                            </span>
                            {it.meta && (
                                <span className="text-[10px] uppercase tracking-[0.14em] text-white/35 whitespace-nowrap">
                                    {it.meta}
                                </span>
                            )}
                        </div>
                        {it.secondary && (
                            <p className="text-xs text-white/45 truncate font-mono mt-0.5">
                                {it.secondary}
                            </p>
                        )}
                    </div>
                    <time className="text-xs text-white/40 tabular-nums whitespace-nowrap self-start mt-1">
                        {relTime(it.timestamp)}
                    </time>
                </li>
            ))}
        </ol>
    );
}

function logEntryToItem(entry: SyncLogEntry): LogItem {
    const dotClass = entry.isActive
        ? "bg-primary animate-pulse"
        : entry.type === "error"
            ? "bg-red-400"
            : entry.type === "completed"
                ? "bg-emerald-400/80"
                : entry.type === "started"
                    ? "bg-sky-400/80"
                    : "bg-white/30";
    return {
        id: entry.id,
        timestamp: entry.timestamp,
        dotClass,
        title: entry.message,
        titleClass: entry.type === "error" ? "text-red-300" : undefined,
    };
}

function errorEntryToItem(err: ReconcileItemError): LogItem {
    const filename = err.path.split("/").pop() ?? err.path;
    return {
        id: err.id,
        timestamp: err.timestamp,
        dotClass: "bg-red-400",
        title: <span className="text-red-300">{err.error}</span>,
        meta: PHASE_LABELS[err.phase],
        secondary: filename,
    };
}

// ---- Reconcile pane ------------------------------------------------------

function ReconcilePane() {
    const sync = useLibrarySync();
    const [triggering, setTriggering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastRunTime, setLastRunTime] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        const es = new EventSource("/api/events/reconcile");
        es.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data) as { type: string; data?: any };
                if (msg.type === "status" && !cancelled) {
                    setLastRunTime(msg.data?.lastRunTime ?? null);
                    es.close();
                }
            } catch {
                /* ignore */
            }
        };
        return () => {
            cancelled = true;
            es.close();
        };
    }, []);

    const trigger = async () => {
        setTriggering(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/reconcile/trigger", { method: "POST" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setTriggering(false);
        }
    };

    const statusText = sync.isReconciling ? "Running" : sync.isConnected ? "Idle" : "Disconnected";
    const statusDot = sync.isReconciling
        ? "bg-primary animate-pulse"
        : sync.isConnected
            ? "bg-emerald-400/70"
            : "bg-white/30";

    const progress = sync.progress;
    const pct =
        progress && progress.total && progress.total > 0 && progress.processed != null
            ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
            : null;

    // Always-visible stats. Live values while running, last run's values otherwise.
    const last = sync.lastResult;
    const stats = {
        scanned: progress?.scannedFiles ?? last?.scannedFiles ?? 0,
        imported: progress?.newFilesImported ?? last?.newFilesImported ?? 0,
        missing: progress?.missingFilesDetected ?? last?.missingFilesDetected ?? 0,
        artwork: progress?.artworkFixed ?? last?.artworkFixed ?? 0,
        deleted: progress?.deletedItems ?? last?.deletedItems ?? 0,
        errors: progress?.errorCount ?? last?.errorCount ?? 0,
    };

    const activityValue = progress
        ? progress.message || "Working"
        : sync.isConnected
            ? "Idle"
            : "Disconnected";

    return (
        <Pane
            title="Reconcile"
            actions={
                <ActionButton onClick={trigger} busy={triggering || sync.isReconciling}>
                    {!triggering && !sync.isReconciling && <Play className="w-3 h-3" />}
                    {sync.isReconciling ? "Running" : "Run now"}
                </ActionButton>
            }
        >
            {error && <ErrorBanner>{error}</ErrorBanner>}

            <div className="space-y-1.5 mb-5">
                <KV
                    label="Status"
                    value={
                        <span className="inline-flex items-center gap-2">
                            <span className={cn("w-1.5 h-1.5 rounded-full", statusDot)} />
                            {statusText}
                        </span>
                    }
                />
                <KV label="Last run" value={relTime(lastRunTime)} valueClass="tabular-nums" />
                <KV label="Activity" value={activityValue} valueClass="truncate" />
                {progress?.currentPath && (
                    <KV
                        label="Path"
                        value={
                            <span className="font-mono text-xs text-white/60">
                                {progress.currentPath}
                            </span>
                        }
                    />
                )}
            </div>

            {pct != null && progress?.total != null && progress?.processed != null && (
                <div className="flex items-center gap-3 mb-5">
                    <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                            className="h-full bg-primary/80 transition-[width] duration-200 ease-out"
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    <span className="text-xs text-white/70 tabular-nums whitespace-nowrap min-w-[110px] text-right">
                        {fmt(progress.processed)} / {fmt(progress.total)}
                    </span>
                    <span className="text-xs text-white/45 tabular-nums w-10 text-right">
                        {pct}%
                    </span>
                </div>
            )}

            <div className="mb-6">
                <StatGrid
                    columns={3}
                    items={[
                        { label: "Scanned", value: fmt(stats.scanned) },
                        {
                            label: "Imported",
                            value: fmt(stats.imported),
                            tone: stats.imported > 0 ? "ok" : "muted",
                        },
                        {
                            label: "Missing",
                            value: fmt(stats.missing),
                            tone: stats.missing > 0 ? "warn" : "muted",
                        },
                        { label: "Artwork", value: fmt(stats.artwork) },
                        { label: "Deleted", value: fmt(stats.deleted) },
                        {
                            label: "Errors",
                            value: fmt(stats.errors),
                            tone: stats.errors > 0 ? "warn" : "muted",
                        },
                    ]}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
                <div>
                    <SubLabel>Activity</SubLabel>
                    <div className="max-h-72 overflow-y-auto pr-1">
                        <CommitLog
                            items={[...sync.log].reverse().map(logEntryToItem)}
                            empty="No recent activity."
                        />
                    </div>
                </div>

                <div>
                    <div className="flex items-baseline justify-between mb-2">
                        <SubLabel className="mb-0">Errors</SubLabel>
                        {sync.itemErrors.length > 0 && (
                            <span className="text-[10px] text-white/40 tabular-nums">
                                {sync.itemErrors.length} total
                            </span>
                        )}
                    </div>
                    <div className="max-h-72 overflow-y-auto pr-1">
                        <CommitLog
                            items={sync.itemErrors.map(errorEntryToItem)}
                            empty="No errors."
                        />
                    </div>
                </div>
            </div>
        </Pane>
    );
}

// ---- Trash pane ----------------------------------------------------------

function TrashPane() {
    const [data, setData] = useState<TrashResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<Set<string>>(new Set());
    const queryClient = useQueryClient();

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/trash");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setData((await res.json()) as TrashResponse);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const restore = async (kind: "a" | "i", id: number) => {
        const key = `${kind}:${id}`;
        setBusy((s) => new Set(s).add(key));
        setError(null);
        try {
            const url = kind === "a" ? `/api/album/${id}/restore` : `/api/items/${id}/restore`;
            const res = await fetch(url, { method: "POST" });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.details ?? body.error ?? `HTTP ${res.status}`);
            }
            // Drop the library cache (TanStack Query's 60s staleTime would
            // otherwise hide the restored album until a reconcile completed)
            // and re-fetch the trash list.
            queryClient.invalidateQueries({ queryKey: ["albums"] });
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy((s) => {
                const next = new Set(s);
                next.delete(key);
                return next;
            });
        }
    };

    const albumCount = data?.albums.length ?? 0;
    const itemCount = data?.items.length ?? 0;
    const total = albumCount + itemCount;

    const summary = data
        ? `${fmt(albumCount)} album${albumCount === 1 ? "" : "s"}, ${fmt(itemCount)} track${
            itemCount === 1 ? "" : "s"
        }`
        : undefined;

    return (
        <Pane title="Trash" summary={summary}>
            {error && <ErrorBanner>{error}</ErrorBanner>}

            {!data ? (
                <p className="text-xs text-white/45 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading
                </p>
            ) : total === 0 ? (
                <p className="text-xs text-white/45">Nothing in the trash.</p>
            ) : (
                <ul className="divide-y divide-white/[0.04] max-h-80 overflow-y-auto">
                    {data.albums.map((a) => (
                        <TrashRow
                            key={`a-${a.id}`}
                            kind="Album"
                            primary={a.album}
                            secondary={[
                                a.albumartist,
                                a.year != null ? String(a.year) : null,
                                `${a.itemCount} track${a.itemCount === 1 ? "" : "s"}`,
                            ]
                                .filter(Boolean)
                                .join(", ")}
                            timestamp={a.marked_for_deletion}
                            busy={busy.has(`a:${a.id}`)}
                            onRestore={() => restore("a", a.id)}
                        />
                    ))}
                    {data.items.map((it) => {
                        const filename = it.path.split("/").pop() ?? it.path;
                        return (
                            <TrashRow
                                key={`i-${it.id}`}
                                kind="Track"
                                primary={it.title ?? filename}
                                secondary={[it.artist ?? "unknown artist", it.album]
                                    .filter(Boolean)
                                    .join(", ")}
                                timestamp={it.marked_for_deletion}
                                busy={busy.has(`i:${it.id}`)}
                                onRestore={() => restore("i", it.id)}
                            />
                        );
                    })}
                </ul>
            )}
        </Pane>
    );
}

function TrashRow({
    primary,
    secondary,
    timestamp,
    kind,
    busy,
    onRestore,
}: {
    primary: string;
    secondary: string;
    timestamp: number;
    kind: "Album" | "Track";
    busy: boolean;
    onRestore: () => void;
}) {
    return (
        <li className="grid grid-cols-[60px_1fr_auto_auto] items-center gap-4 py-2.5">
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium">
                {kind}
            </span>
            <div className="min-w-0">
                <p className="text-sm text-white/90 truncate">{primary}</p>
                <p className="text-xs text-white/50 truncate">{secondary}</p>
            </div>
            <span className="text-[11px] text-white/40 tabular-nums whitespace-nowrap hidden sm:inline">
                {relTime(timestamp)}
            </span>
            <button
                type="button"
                onClick={onRestore}
                disabled={busy}
                className="text-xs text-white/70 hover:text-white disabled:opacity-50 flex items-center gap-1 px-2 py-1 rounded hover:bg-white/[0.04] transition-colors"
            >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                Restore
            </button>
        </li>
    );
}

// ---- Import history pane -------------------------------------------------

function ImportHistoryPane() {
    const [data, setData] = useState<HeatmapData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetch("/api/admin/import-heatmap")
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json() as Promise<HeatmapData>;
            })
            .then(setData)
            .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, []);

    useEffect(() => {
        if (!data || !scrollRef.current) return;
        scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }, [data]);

    const endDate = new Date();
    const startDate = (() => {
        const validDates = (data ?? [])
            .map((d) => d.date)
            .filter((s): s is string => typeof s === "string" && s.length > 0)
            .sort();
        if (validDates.length > 0) {
            const earliest = new Date(validDates[0] + "T00:00:00");
            if (!Number.isNaN(earliest.getTime())) return earliest;
        }
        const fallback = new Date();
        fallback.setFullYear(endDate.getFullYear() - 1);
        return fallback;
    })();

    const totalSongs = data?.reduce((s, d) => s + d.value, 0) ?? 0;
    const activeDays = data?.filter((d) => d.value > 0).length ?? 0;

    const summary = data
        ? `${fmt(totalSongs)} song${totalSongs === 1 ? "" : "s"}, ${fmt(activeDays)} active day${
            activeDays === 1 ? "" : "s"
        }`
        : undefined;

    return (
        <Pane title="Import history" summary={summary}>
            {error && <ErrorBanner>{error}</ErrorBanner>}

            {!data && !error && (
                <p className="text-xs text-white/45 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading
                </p>
            )}

            {data && (
                <div ref={scrollRef} className="overflow-x-auto">
                    <Heatmap
                        data={data}
                        startDate={startDate}
                        endDate={endDate}
                        colorMode="interpolate"
                        interpolation="sqrt"
                        cellSize={12}
                        gap={3}
                        maxColor="#e84140"
                        minColor="#2a0a0a"
                        valueDisplayFunction={(v) => `${v} song${v === 1 ? "" : "s"}`}
                    />
                </div>
            )}
        </Pane>
    );
}

// ---- Tool cards ----------------------------------------------------------
//
// Each tool is a self-contained component. Adding a new tool is a one-line
// append to the TOOLS array below; the Tools pane grids them automatically.

function ToolCard({
    title,
    description,
    actions,
    children,
}: {
    title: string;
    description: string;
    actions: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-4 flex flex-col gap-3">
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-sm font-medium text-white/90">{title}</h3>
                    <p className="text-xs text-white/55 mt-1 leading-relaxed">{description}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">{actions}</div>
            </header>
            {children}
        </div>
    );
}

function RefetchTool() {
    const [loading, setLoading] = useState<"none" | "preview" | "run">("none");
    const [preview, setPreview] = useState<RefetchPreview | null>(null);
    const [report, setReport] = useState<RefetchReport | null>(null);
    const [error, setError] = useState<string | null>(null);

    const doPreview = async () => {
        setLoading("preview");
        setError(null);
        setReport(null);
        try {
            const res = await fetch("/api/admin/refetch-musicbrainz");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setPreview((await res.json()) as RefetchPreview);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading("none");
        }
    };

    const doRun = async () => {
        if (!preview) return;
        const minutes = Math.ceil((preview.count * 1.5) / 60);
        if (
            !confirm(
                `Run MusicBrainz lookup on ${preview.count} items? Rate limited to ~1.5s per request (about ${minutes} minute${minutes === 1 ? "" : "s"}).`,
            )
        ) {
            return;
        }
        setLoading("run");
        setError(null);
        try {
            const res = await fetch("/api/admin/refetch-musicbrainz", { method: "POST" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setReport((await res.json()) as RefetchReport);
            const res2 = await fetch("/api/admin/refetch-musicbrainz");
            if (res2.ok) setPreview((await res2.json()) as RefetchPreview);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading("none");
        }
    };

    return (
        <ToolCard
            title="Re-fetch MusicBrainz"
            description="Re-runs MusicBrainz lookup on items still linked to Unknown Album rows."
            actions={
                <>
                    <ActionButton onClick={doPreview} busy={loading === "preview"} disabled={loading !== "none"}>
                        Preview
                    </ActionButton>
                    <ActionButton
                        onClick={doRun}
                        busy={loading === "run"}
                        disabled={loading !== "none" || !preview || preview.count === 0}
                    >
                        Run
                    </ActionButton>
                </>
            }
        >
            {error && <ErrorBanner>{error}</ErrorBanner>}

            {loading === "run" && (
                <p className="text-xs text-white/55 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Looking up. This may take a few minutes.
                </p>
            )}

            {report && (
                <StatGrid
                    columns={4}
                    items={[
                        { label: "Probed", value: fmt(report.probed) },
                        { label: "Enriched", value: fmt(report.enriched), tone: "ok" },
                        { label: "Relinked", value: fmt(report.relinked), tone: "ok" },
                        {
                            label: "Failed",
                            value: fmt(report.failed),
                            tone: report.failed > 0 ? "warn" : "muted",
                        },
                    ]}
                />
            )}

            {report && report.details.length > 0 && (
                <ul className="max-h-44 overflow-y-auto">
                    {report.details
                        .filter((d) => d.filledFields.length > 0 || d.error)
                        .map((d) => {
                            const filename = d.path.split("/").pop() ?? d.path;
                            return (
                                <li
                                    key={d.itemId}
                                    className="grid grid-cols-[1fr_auto] gap-3 text-xs py-1"
                                >
                                    <span className="min-w-0 flex items-baseline gap-2">
                                        <span className="text-white/35 font-mono">{`#${d.itemId}`}</span>
                                        <span className="text-white/80 truncate font-mono">
                                            {filename}
                                        </span>
                                    </span>
                                    {d.error ? (
                                        <span className="text-red-300 truncate">{d.error}</span>
                                    ) : (
                                        <span className="text-white/55 truncate">
                                            {d.filledFields.length > 0
                                                ? `Filled: ${d.filledFields.join(", ")}`
                                                : "OK"}
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                </ul>
            )}

            {preview && !report && (
                <p className="text-xs text-white/55">
                    {preview.count} item{preview.count === 1 ? "" : "s"} would be probed.
                </p>
            )}
        </ToolCard>
    );
}

function DedupTool() {
    const [loading, setLoading] = useState<"none" | "preview" | "run">("none");
    const [report, setReport] = useState<DedupReport | null>(null);
    const [error, setError] = useState<string | null>(null);

    const run = async (mode: "preview" | "run") => {
        setLoading(mode);
        setError(null);
        try {
            const url =
                mode === "preview"
                    ? "/api/admin/deduplicate-albums"
                    : "/api/admin/deduplicate-albums?dryRun=false";
            const opts = mode === "preview" ? undefined : { method: "POST" };
            const res = await fetch(url, opts);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setReport((await res.json()) as DedupReport);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading("none");
        }
    };

    return (
        <ToolCard
            title="Deduplicate albums"
            description="Merges duplicate album rows by mb_releasegroupid and normalized name + artist + year."
            actions={
                <>
                    <ActionButton
                        onClick={() => run("preview")}
                        busy={loading === "preview"}
                        disabled={loading !== "none"}
                    >
                        Preview
                    </ActionButton>
                    <ActionButton
                        onClick={() => {
                            if (confirm("Permanently merge duplicate album rows. Continue?")) run("run");
                        }}
                        busy={loading === "run"}
                        disabled={loading !== "none" || !report || report.groupsFound === 0}
                    >
                        Merge
                    </ActionButton>
                </>
            }
        >
            {error && <ErrorBanner>{error}</ErrorBanner>}

            {report && (
                <>
                    <StatGrid
                        columns={4}
                        items={[
                            { label: "Groups", value: fmt(report.groupsFound) },
                            {
                                label: report.dryRun ? "Would merge" : "Merged",
                                value: fmt(report.albumsMerged),
                                tone: report.dryRun ? "muted" : "ok",
                            },
                            { label: "Items moved", value: fmt(report.itemsReassigned) },
                            { label: "Names restored", value: fmt(report.namesRestored) },
                        ]}
                    />
                    {report.dryRun && (
                        <p className="text-[11px] text-white/45">Dry run. Click Merge to apply.</p>
                    )}
                </>
            )}

            {report && report.groups.length > 0 && (
                <ul className="max-h-44 overflow-y-auto space-y-2">
                    {report.groups.map((g) => (
                        <li key={g.key} className="text-xs">
                            <div className="grid grid-cols-[1fr_auto] gap-3 items-baseline">
                                <div className="min-w-0">
                                    <p className="text-white/85 truncate">
                                        {g.canonicalAlbum ?? "(unknown)"}
                                    </p>
                                    <p className="text-white/45 truncate">
                                        {g.canonicalArtist ?? "(unknown artist)"}
                                    </p>
                                </div>
                                <span className="text-white/35 font-mono whitespace-nowrap">
                                    {g.key}
                                </span>
                            </div>
                            <ul className="ml-4 mt-1 space-y-0.5 text-white/55">
                                {g.merged.map((m) => (
                                    <li key={m.id} className="grid grid-cols-[60px_1fr] gap-2">
                                        <span className="text-white/35 font-mono tabular-nums">
                                            {`#${m.id}`}
                                        </span>
                                        <span className="truncate">
                                            {m.album ?? "(no name)"}
                                            {m.albumartist ? `, ${m.albumartist}` : ""}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ul>
            )}

            {report && report.groups.length === 0 && (
                <p className="text-xs text-white/45">No duplicates found.</p>
            )}
        </ToolCard>
    );
}

// Extensible tool registry. To add a new tool: build a self-contained
// component and append it here. The Tools pane handles layout.
const TOOLS: Array<{ key: string; Component: React.ComponentType }> = [
    { key: "refetch", Component: RefetchTool },
    { key: "dedupe", Component: DedupTool },
];

function ToolsPane() {
    return (
        <Pane
            title="Tools"
            summary={`${TOOLS.length} available`}
        >
            <Description>
                Targeted cleanup utilities. Run on demand. Safe to re-run.
            </Description>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {TOOLS.map(({ key, Component }) => (
                    <Component key={key} />
                ))}
            </div>
        </Pane>
    );
}

// ---- Page ----------------------------------------------------------------

export default function Maintenance() {
    return (
        <div className="container mx-auto px-4 md:px-6 pt-2 pb-16 max-w-6xl">
            <div className="pt-2 pb-1">
                <Link
                    to="/"
                    search={{ page: 1, sort: "recently-added" as const }}
                    className="text-[11px] uppercase tracking-[0.14em] text-white/45 hover:text-white/70 font-medium transition-colors"
                >
                    ← Library
                </Link>
            </div>
            <h1 className="font-heading text-3xl md:text-4xl font-black tracking-tight mt-1 mb-1">
                Maintenance
            </h1>
            <p className="text-sm text-white/60 mb-6">
                Reconciler, trash, and library cleanup tools.
            </p>

            <div className="grid grid-cols-1 gap-3">
                <ReconcilePane />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <TrashPane />
                    <ImportHistoryPane />
                </div>
                <ToolsPane />
            </div>
        </div>
    );
}
