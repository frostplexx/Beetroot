import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Pane, StatGrid, ErrorBanner, Description, ActionButton } from "./primitives";
import { fmt } from "./utils";
import type { DedupReport, RefetchPreview, RefetchReport } from "./types";

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

const TOOLS: Array<{ key: string; Component: React.ComponentType }> = [
    { key: "refetch", Component: RefetchTool },
    { key: "dedupe", Component: DedupTool },
];

export function ToolsPane() {
    return (
        <Pane title="Tools" summary={`${TOOLS.length} available`}>
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
