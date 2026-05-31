import { useEffect, useState } from "react";
import { useLibrarySync } from "@/hooks/use-library-sync";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pane, KV, StatGrid, SubLabel, ErrorBanner, ActionButton } from "./primitives";
import { CommitLog, logEntryToItem, errorEntryToItem } from "./commit-log";
import { relTime, fmt } from "./utils";

export function ReconcilePane() {
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

    const hasErrors = (sync.lastResult?.errorCount ?? 0) > 0 || sync.itemErrors.length > 0;
    const statusText = sync.isReconciling ? "Running" : sync.isConnected ? "Idle" : "Disconnected";
    const statusDot = sync.isReconciling
        ? "bg-emerald-400 animate-pulse"
        : hasErrors && sync.isConnected
            ? "bg-red-400"
            : "bg-white/30";

    const progress = sync.progress;
    const pct =
        progress && progress.total && progress.total > 0 && progress.processed != null
            ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
            : null;

    const last = sync.lastResult;
    const stats = {
        scanned: progress?.scannedFiles ?? last?.scannedFiles ?? 0,
        imported: progress?.newFilesImported ?? last?.newFilesImported ?? 0,
        missing: progress?.missingFilesDetected ?? last?.missingFilesDetected ?? 0,
        artwork: progress?.artworkFixed ?? last?.artworkFixed ?? 0,
        deleted: progress?.deletedItems ?? last?.deletedItems ?? 0,
        errors: progress?.errorCount ?? last?.errorCount ?? 0,
    };

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
                <span className="inline-flex items-center gap-2">
                    <span className={cn("w-1.5 h-1.5 rounded-full", statusDot)} />
                    {statusText} <div className="text-white/50">last run {relTime(lastRunTime)}</div>
                </span>
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
