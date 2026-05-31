import { cn } from "@/lib/utils";
import { PHASE_LABELS, type SyncLogEntry, type ReconcileItemError } from "@/hooks/use-library-sync";
import { relTime } from "./utils";

export type LogItem = {
    id: number;
    timestamp: number;
    dotClass: string;
    title: React.ReactNode;
    titleClass?: string;
    meta?: React.ReactNode;
    secondary?: React.ReactNode;
};

export function CommitLog({ items, empty }: { items: LogItem[]; empty: string }) {
    if (items.length === 0) {
        return <p className="text-xs text-white/45">{empty}</p>;
    }
    return (
        <ol className="relative pl-1">
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
                            <span className={cn("text-sm text-white/85 break-words min-w-0", it.titleClass)}>
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

export function logEntryToItem(entry: SyncLogEntry): LogItem {
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

export function errorEntryToItem(err: ReconcileItemError): LogItem {
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
