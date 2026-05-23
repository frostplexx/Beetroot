"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Layers,
    RefreshCw,
    Loader2,
    AlertTriangle,
    CheckCircle2,
    ChevronRight,
} from "lucide-react";

// ---- Dedup types (subset of the API response) ----
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
        album: string | null;
        year: number | null;
        mb_releasegroupid: string | null;
        mb_albumid: string | null;
        album_id: number | null;
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

// ---- Generic shells ----
function Card({ children }: { children: React.ReactNode }) {
    return (
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
            {children}
        </section>
    );
}

function CardHeader({
    icon: Icon,
    title,
    description,
}: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    description: string;
}) {
    return (
        <div className="flex items-start gap-3 mb-4">
            <div className="rounded-md bg-white/10 p-2 mt-0.5">
                <Icon className="w-5 h-5" />
            </div>
            <div>
                <h2 className="text-lg font-semibold">{title}</h2>
                <p className="text-sm text-white/60 mt-1">{description}</p>
            </div>
        </div>
    );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "ok" | "warn" }) {
    const toneClass =
        tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : "text-white";
    return (
        <div className="flex flex-col">
            <span className="text-xs uppercase tracking-wide text-white/40">{label}</span>
            <span className={`text-xl font-semibold ${toneClass}`}>{value}</span>
        </div>
    );
}

// ---- Dedup card ----
function DedupCard() {
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

    const isRisky = (g: DedupGroup) => g.key.startsWith("fold:") && g.merged.length >= 2;

    return (
        <Card>
            <CardHeader
                icon={Layers}
                title="Deduplicate Albums"
                description="Merges duplicate album rows by mb_releasegroupid, normalized name, and matching (artist, year) on Unknown Album rows."
            />

            <div className="flex gap-2 mb-4">
                <Button
                    variant="outline"
                    onClick={() => run("preview")}
                    disabled={loading !== "none"}
                >
                    {loading === "preview" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    Preview
                </Button>
                <Button
                    variant="default"
                    onClick={() => {
                        if (
                            confirm(
                                "This will permanently merge duplicate album rows. Run preview first if you haven't. Continue?"
                            )
                        ) {
                            run("run");
                        }
                    }}
                    disabled={loading !== "none" || !report || report.groupsFound === 0}
                >
                    {loading === "run" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Merge Duplicates
                </Button>
            </div>

            {error && (
                <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200 mb-4">
                    <AlertTriangle className="w-4 h-4 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {report && (
                <>
                    <div className="grid grid-cols-4 gap-4 mb-4 rounded-md bg-white/[0.03] p-4">
                        <Stat label="Groups" value={report.groupsFound} />
                        <Stat
                            label="Merged"
                            value={report.albumsMerged}
                            tone={report.dryRun ? undefined : "ok"}
                        />
                        <Stat label="Items moved" value={report.itemsReassigned} />
                        <Stat label="Names restored" value={report.namesRestored} />
                    </div>

                    {report.dryRun && (
                        <p className="text-xs text-white/40 mb-3">
                            Dry-run preview. Click Merge Duplicates to apply.
                        </p>
                    )}

                    {report.groups.length === 0 ? (
                        <p className="text-sm text-white/50">No duplicates found.</p>
                    ) : (
                        <ul className="space-y-2">
                            {report.groups.map((g) => (
                                <li
                                    key={g.key}
                                    className="rounded-md border border-white/10 bg-white/[0.02] p-3"
                                >
                                    <div className="flex items-center gap-2 text-sm">
                                        {isRisky(g) ? (
                                            <AlertTriangle
                                                className="w-4 h-4 text-amber-400"
                                                aria-label="Multiple items folded"
                                            />
                                        ) : (
                                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                        )}
                                        <span className="font-medium">
                                            {g.canonicalAlbum ?? "(unknown)"}
                                        </span>
                                        <span className="text-white/50">
                                            — {g.canonicalArtist ?? "(unknown artist)"}
                                        </span>
                                        <span className="ml-auto text-xs text-white/40">
                                            {g.key}
                                        </span>
                                    </div>
                                    <div className="mt-2 ml-6 space-y-1 text-xs text-white/60">
                                        {g.merged.map((m) => (
                                            <div key={m.id} className="flex items-center gap-1">
                                                <ChevronRight className="w-3 h-3" />
                                                <span>
                                                    <span className="text-white/40">#{m.id}</span>{" "}
                                                    {m.album ?? "(no name)"} —{" "}
                                                    {m.albumartist ?? "(no artist)"}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </Card>
    );
}

// ---- Refetch card ----
function RefetchCard() {
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
        if (
            !confirm(
                `Run MusicBrainz lookup on ${preview.count} items? This is rate-limited and may take ${Math.ceil(
                    (preview.count * 1.5) / 60
                )} minute(s).`
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
            // Refresh preview list (the orphan set should now be smaller)
            const res2 = await fetch("/api/admin/refetch-musicbrainz");
            if (res2.ok) setPreview((await res2.json()) as RefetchPreview);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading("none");
        }
    };

    return (
        <Card>
            <CardHeader
                icon={RefreshCw}
                title="Re-fetch MusicBrainz"
                description="Runs the MusicBrainz lookup again on items linked to Unknown Album rows. Slow: respects MB's ~1.5s/request rate limit. Falls back to text search when fingerprinting fails (e.g. m4a)."
            />

            <div className="flex gap-2 mb-4">
                <Button
                    variant="outline"
                    onClick={doPreview}
                    disabled={loading !== "none"}
                >
                    {loading === "preview" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    Preview Targets
                </Button>
                <Button
                    variant="default"
                    onClick={doRun}
                    disabled={loading !== "none" || !preview || preview.count === 0}
                >
                    {loading === "run" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Run Refetch
                </Button>
            </div>

            {error && (
                <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200 mb-4">
                    <AlertTriangle className="w-4 h-4 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {loading === "run" && (
                <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] p-3 text-sm text-white/70 mb-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running MusicBrainz lookup… this may take a few minutes.
                </div>
            )}

            {report && (
                <div className="grid grid-cols-4 gap-4 mb-4 rounded-md bg-white/[0.03] p-4">
                    <Stat label="Probed" value={report.probed} />
                    <Stat label="Enriched" value={report.enriched} tone="ok" />
                    <Stat label="Relinked" value={report.relinked} tone="ok" />
                    <Stat
                        label="Failed"
                        value={report.failed}
                        tone={report.failed > 0 ? "warn" : undefined}
                    />
                </div>
            )}

            {report && report.details.length > 0 && (
                <ul className="space-y-2 mb-4">
                    {report.details
                        .filter((d) => d.filledFields.length > 0 || d.error)
                        .map((d) => {
                            const filename = d.path.split("/").pop() ?? d.path;
                            return (
                                <li
                                    key={d.itemId}
                                    className="rounded-md border border-white/10 bg-white/[0.02] p-3 text-xs"
                                >
                                    <div className="flex items-center gap-2">
                                        {d.error ? (
                                            <AlertTriangle className="w-4 h-4 text-red-400" />
                                        ) : d.newAlbumId !== null ? (
                                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                        ) : (
                                            <CheckCircle2 className="w-4 h-4 text-white/40" />
                                        )}
                                        <span className="font-medium">{filename}</span>
                                        <span className="ml-auto text-white/40">
                                            #{d.itemId}
                                        </span>
                                    </div>
                                    {d.error ? (
                                        <p className="mt-1 ml-6 text-red-300">{d.error}</p>
                                    ) : (
                                        <div className="mt-1 ml-6 text-white/60 space-y-0.5">
                                            {d.filledFields.length > 0 && (
                                                <div>
                                                    <span className="text-white/40">Filled:</span>{" "}
                                                    {d.filledFields.join(", ")}
                                                </div>
                                            )}
                                            {d.newAlbumId !== null && (
                                                <div>
                                                    <span className="text-white/40">Album:</span>{" "}
                                                    #{d.oldAlbumId} → #{d.newAlbumId}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                </ul>
            )}

            {preview && !report && (
                <>
                    <p className="text-sm text-white/60 mb-2">
                        {preview.count} item{preview.count === 1 ? "" : "s"} would be probed.
                    </p>
                    {preview.count > 0 && (
                        <ul className="space-y-1 max-h-96 overflow-y-auto">
                            {preview.items.map((it) => {
                                const filename = it.path.split("/").pop() ?? it.path;
                                return (
                                    <li
                                        key={it.id}
                                        className="text-xs text-white/60 px-2 py-1 rounded hover:bg-white/[0.04]"
                                    >
                                        <span className="text-white/40">#{it.id}</span>{" "}
                                        <span className="text-white/80">{filename}</span>
                                        {it.title && (
                                            <span className="text-white/50">
                                                {" "}
                                                — {it.title}
                                            </span>
                                        )}
                                        {it.artist && (
                                            <span className="text-white/40">
                                                {" "}
                                                ({it.artist}
                                                {it.year ? `, ${it.year}` : ""})
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </>
            )}
        </Card>
    );
}

export default function Maintenance() {
    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
            <div className="mb-8">
                <h1 className="text-2xl font-bold mb-1">Library Maintenance</h1>
                <p className="text-sm text-white/60">
                    Tools to clean up duplicate albums and re-enrich items with weak metadata.
                </p>
            </div>

            <div className="space-y-6">
                <RefetchCard />
                <DedupCard />
            </div>

            <div className="mt-8 text-xs text-white/40">
                <p>
                    Recommended order: <strong>Refetch</strong> first (fills in missing
                    MusicBrainz IDs), then <strong>Deduplicate</strong> (merges rows that
                    now share IDs).
                </p>
            </div>
        </div>
    );
}
