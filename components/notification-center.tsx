"use client"

import { useEffect, useMemo, useState } from "react"
import {
    RefreshCw,
    Music,
    AlertCircle,
    CheckCircle2,
    Bell,
    Search,
    Download,
    Image as ImageIcon,
    Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useReconcileEvents, type ReconcileSummary } from "@/lib/ui/use-reconcile-events"
import { cn } from "@/lib/ui/utils"

type Phase = "scanning" | "importing" | "fixing-artwork" | "cleanup"

const PHASES: { key: Phase; label: string; icon: typeof Search }[] = [
    { key: "scanning", label: "Scanning", icon: Search },
    { key: "importing", label: "Importing", icon: Download },
    { key: "fixing-artwork", label: "Artwork", icon: ImageIcon },
    { key: "cleanup", label: "Cleanup", icon: Trash2 },
]

function formatRelative(ts: number | undefined): string | null {
    if (!ts) return null
    const diff = Date.now() - ts
    if (diff < 30_000) return "just now"
    if (diff < 60 * 60_000) return `${Math.round(diff / 60_000)}m ago`
    if (diff < 24 * 60 * 60_000) return `${Math.round(diff / (60 * 60_000))}h ago`
    return new Date(ts).toLocaleDateString()
}

function useRelativeTime(ts: number | undefined) {
    const [, force] = useState(0)
    useEffect(() => {
        if (!ts) return
        const id = setInterval(() => force((n) => n + 1), 30_000)
        return () => clearInterval(id)
    }, [ts])
    return formatRelative(ts)
}

function Stat({
    label,
    value,
    tone = "default",
}: {
    label: string
    value: number | string
    tone?: "default" | "good" | "warn" | "bad"
}) {
    const valueClass = {
        default: "text-white",
        good: "text-emerald-400",
        warn: "text-amber-400",
        bad: "text-red-400",
    }[tone]
    return (
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">
                {label}
            </span>
            <span className={cn("text-lg font-semibold tabular-nums", valueClass)}>{value}</span>
        </div>
    )
}

function PhaseStepper({ active }: { active: Phase | undefined }) {
    const activeIndex = PHASES.findIndex((p) => p.key === active)
    return (
        <div className="flex items-center justify-between gap-1.5">
            {PHASES.map((phase, i) => {
                const Icon = phase.icon
                const isActive = i === activeIndex
                const isDone = activeIndex >= 0 && i < activeIndex
                return (
                    <div key={phase.key} className="flex-1 flex flex-col items-center gap-1.5">
                        <div
                            className={cn(
                                "relative h-8 w-8 rounded-full flex items-center justify-center border transition-all",
                                isActive &&
                                    "border-primary bg-primary/15 text-primary shadow-[0_0_18px_-3px_var(--color-primary)]",
                                isDone && "border-emerald-500/50 bg-emerald-500/10 text-emerald-400",
                                !isActive && !isDone && "border-white/10 bg-white/[0.02] text-white/30",
                            )}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {isActive && (
                                <span className="absolute inset-0 rounded-full animate-ping bg-primary/30" />
                            )}
                        </div>
                        <span
                            className={cn(
                                "text-[10px] font-medium leading-none",
                                isActive && "text-white",
                                isDone && "text-emerald-400/80",
                                !isActive && !isDone && "text-white/30",
                            )}
                        >
                            {phase.label}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}

function LastRunSummary({ summary }: { summary: ReconcileSummary }) {
    const relative = useRelativeTime(summary.timestamp)
    const hasErrors = !!summary.errors && summary.errors > 0

    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                    <div
                        className={cn(
                            "h-8 w-8 rounded-full flex items-center justify-center",
                            hasErrors
                                ? "bg-amber-500/15 text-amber-400"
                                : "bg-emerald-500/15 text-emerald-400",
                        )}
                    >
                        {hasErrors ? (
                            <AlertCircle className="h-4 w-4" />
                        ) : (
                            <CheckCircle2 className="h-4 w-4" />
                        )}
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-white">Last reconcile</div>
                        <div className="text-xs text-white/50">
                            {relative ?? "—"}
                            {summary.duration ? ` · ${summary.duration}` : ""}
                        </div>
                    </div>
                </div>
                {summary.hasChanges ? (
                    <Badge className="bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
                        Changes
                    </Badge>
                ) : (
                    <Badge variant="outline" className="border-white/15 text-white/50">
                        No changes
                    </Badge>
                )}
            </div>

            <div className="grid grid-cols-2 gap-2">
                <Stat label="Scanned" value={summary.scannedFiles ?? 0} />
                <Stat
                    label="Imported"
                    value={summary.newFilesImported ?? 0}
                    tone={summary.newFilesImported ? "good" : "default"}
                />
                <Stat
                    label="Missing"
                    value={summary.missingFilesDetected ?? 0}
                    tone={summary.missingFilesDetected ? "warn" : "default"}
                />
                <Stat label="Artwork fixed" value={summary.artworkFixed ?? 0} />
                <Stat label="Deleted" value={summary.deletedItems ?? 0} />
                <Stat
                    label="Errors"
                    value={summary.errors ?? 0}
                    tone={hasErrors ? "bad" : "default"}
                />
            </div>
        </div>
    )
}

function RunningCard({
    progress,
}: {
    progress: {
        phase?: string
        scannedFiles?: number
        newFilesFound?: number
        newFilesImported?: number
        artworkFixed?: number
    } | null
}) {
    const phase = (progress?.phase as Phase | undefined) ?? "scanning"
    const total = (progress?.scannedFiles ?? 0) + (progress?.newFilesFound ?? 0)

    // The reconcile service doesn't expose a total upfront, so we show
    // determinate progress only while importing — otherwise an indeterminate
    // shimmer.
    const importPct = useMemo(() => {
        if (phase !== "importing") return null
        const found = progress?.newFilesFound ?? 0
        const done = progress?.newFilesImported ?? 0
        if (found <= 0) return null
        return Math.min(100, Math.round((done / found) * 100))
    }, [phase, progress?.newFilesFound, progress?.newFilesImported])

    return (
        <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4 space-y-4 shadow-[0_0_40px_-15px_var(--color-primary)]">
            <PhaseStepper active={phase} />

            {importPct !== null ? (
                <div className="space-y-1.5">
                    <Progress value={importPct} className="h-1.5 bg-white/5" />
                    <div className="flex justify-between text-[11px] text-white/50">
                        <span>{progress?.newFilesImported ?? 0} imported</span>
                        <span className="tabular-nums">{importPct}%</span>
                    </div>
                </div>
            ) : (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                    <div className="h-full w-1/3 rounded-full bg-primary/60 animate-[indeterminate_1.4s_ease-in-out_infinite]" />
                </div>
            )}

            <div className="grid grid-cols-2 gap-2">
                <Stat label="Scanned" value={progress?.scannedFiles ?? 0} />
                <Stat label="New found" value={progress?.newFilesFound ?? 0} />
                <Stat
                    label="Imported"
                    value={progress?.newFilesImported ?? 0}
                    tone={progress?.newFilesImported ? "good" : "default"}
                />
                <Stat label="Artwork" value={progress?.artworkFixed ?? 0} />
            </div>
            <p className="text-xs text-white/40 leading-relaxed">
                {total > 0
                    ? `Working through ${total.toLocaleString()} file${total === 1 ? "" : "s"}…`
                    : "Working…"}
            </p>
        </div>
    )
}

export function NotificationCenter() {
    const [open, setOpen] = useState(false)
    const [triggering, setTriggering] = useState(false)

    const { isReconciling, progress, lastResult, lastError } = useReconcileEvents({
        fireOnNoChanges: true,
        onCompleted: (summary) => {
            if (!summary.hasChanges) return
            const parts: string[] = []
            if (summary.newFilesImported) parts.push(`${summary.newFilesImported} imported`)
            if (summary.artworkFixed) parts.push(`${summary.artworkFixed} artwork fixed`)
            if (summary.deletedItems) parts.push(`${summary.deletedItems} deleted`)
            toast.success(
                parts.length ? `Reconcile complete · ${parts.join(", ")}` : "Reconcile complete",
            )
        },
        onError: (message) => toast.error(`Reconcile failed: ${message}`),
    })

    const handleTrigger = async () => {
        setTriggering(true)
        try {
            const res = await fetch("/api/reconcile", { method: "POST" })
            const data = await res.json()
            if (data.started) toast.info("Reconcile started")
            else toast.message(data.message ?? "Already running")
        } catch (err) {
            console.error("Failed to trigger reconcile:", err)
            toast.error("Couldn't reach the server")
        } finally {
            setTriggering(false)
        }
    }

    const hasIndicator = isReconciling || !!lastError

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="relative p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10"
                    aria-label="Library status"
                >
                    <Bell className="h-5 w-5" />
                    {hasIndicator && (
                        <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                            <span
                                className={cn(
                                    "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
                                    lastError ? "bg-red-500" : "bg-primary",
                                )}
                            />
                            <span
                                className={cn(
                                    "relative inline-flex h-2 w-2 rounded-full",
                                    lastError ? "bg-red-500" : "bg-primary",
                                )}
                            />
                        </span>
                    )}
                </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md bg-zinc-950 border-white/10 text-white p-0">
                <SheetHeader className="px-6 pt-6 pb-4 border-b border-white/5">
                    <SheetTitle className="flex items-center gap-2 text-white">
                        <Bell className="h-5 w-5" />
                        Library status
                    </SheetTitle>
                    <SheetDescription className="text-white/50">
                        Reconcile activity and recent results
                    </SheetDescription>
                </SheetHeader>

                <ScrollArea
                    className="h-[calc(100vh-180px)]"
                    style={{ scrollbarGutter: "stable" }}
                >
                    <div className="px-6 py-5 space-y-5">
                        {/* Header: state + trigger */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span
                                    className={cn(
                                        "inline-flex h-2 w-2 rounded-full",
                                        isReconciling
                                            ? "bg-primary animate-pulse"
                                            : lastError
                                              ? "bg-red-500"
                                              : "bg-emerald-500",
                                    )}
                                />
                                <span className="text-sm font-medium">
                                    {isReconciling
                                        ? "Reconciling…"
                                        : lastError
                                          ? "Last run errored"
                                          : "Idle"}
                                </span>
                            </div>
                            <Button
                                onClick={handleTrigger}
                                disabled={isReconciling || triggering}
                                size="sm"
                                className="gap-1.5"
                            >
                                <RefreshCw
                                    className={cn(
                                        "h-3.5 w-3.5",
                                        (isReconciling || triggering) && "animate-spin",
                                    )}
                                />
                                {isReconciling ? "Running" : "Reconcile"}
                            </Button>
                        </div>

                        {/* Live or last */}
                        {isReconciling ? (
                            <RunningCard progress={progress} />
                        ) : lastResult ? (
                            <LastRunSummary summary={lastResult} />
                        ) : (
                            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
                                <Music className="h-10 w-10 mx-auto mb-3 text-white/20" />
                                <p className="text-sm font-medium text-white/70">
                                    No reconcile yet
                                </p>
                                <p className="text-xs text-white/40 mt-1">
                                    Trigger one to scan your library
                                </p>
                            </div>
                        )}

                        {lastError && (
                            <div className="rounded-xl border border-red-500/30 bg-red-500/[0.04] p-4 space-y-2">
                                <div className="flex items-center gap-2 text-sm font-semibold text-red-300">
                                    <AlertCircle className="h-4 w-4" />
                                    Reconcile error
                                </div>
                                <Separator className="bg-red-500/20" />
                                <p className="text-xs font-mono break-all text-red-200/80 leading-relaxed">
                                    {lastError}
                                </p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    )
}
