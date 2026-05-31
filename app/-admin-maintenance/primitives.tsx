import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Pane({
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

export function SubLabel({ children, className }: { children: React.ReactNode; className?: string }) {
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

export function KV({
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

export function StatGrid({
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

export function ErrorBanner({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2 text-sm text-red-300 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{children}</span>
        </div>
    );
}

export function Description({ children }: { children: React.ReactNode }) {
    return <p className="text-xs text-white/55 mb-4 leading-relaxed">{children}</p>;
}

export function ActionButton({
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
