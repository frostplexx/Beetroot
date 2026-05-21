"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { RefreshCw, Music, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useReconcileEvents } from "@/lib/ui/use-reconcile-events"
import { cn } from "@/lib/ui/utils"

export function EmptyLibraryState() {
    const [triggering, setTriggering] = useState(false)

    const { isReconciling, progress, lastResult, lastError } = useReconcileEvents({
        fireOnNoChanges: true,
        onCompleted: (summary) => {
            if (summary.hasChanges) {
                toast.success(
                    summary.newFilesImported
                        ? `Imported ${summary.newFilesImported} track${summary.newFilesImported === 1 ? "" : "s"}`
                        : "Library updated",
                )
            }
        },
        onError: (msg) => toast.error(`Reconcile failed: ${msg}`),
    })

    const handleScan = async () => {
        setTriggering(true)
        try {
            const res = await fetch("/api/reconcile", { method: "POST" })
            const data = await res.json()
            if (data.started) toast.info("Scanning your music directory…")
            else toast.message(data.message ?? "Already running")
        } catch {
            toast.error("Couldn't reach the server")
        } finally {
            setTriggering(false)
        }
    }

    // Determinate progress only when we have a useful denominator.
    const found = progress?.newFilesFound ?? 0
    const imported = progress?.newFilesImported ?? 0
    const pct =
        progress?.phase === "importing" && found > 0
            ? Math.min(100, Math.round((imported / found) * 100))
            : null

    return (
        <div className="text-center py-16 max-w-md mx-auto">
            <div
                className={cn(
                    "inline-flex p-4 rounded-full mb-4 transition-colors",
                    isReconciling
                        ? "bg-primary/10 text-primary"
                        : lastError
                          ? "bg-red-500/10 text-red-400"
                          : lastResult && !lastResult.hasChanges
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-white/5 text-white/40",
                )}
            >
                {isReconciling ? (
                    <Loader2 className="w-8 h-8 animate-spin" />
                ) : lastError ? (
                    <AlertCircle className="w-8 h-8" />
                ) : lastResult && !lastResult.hasChanges ? (
                    <CheckCircle2 className="w-8 h-8" />
                ) : (
                    <Music className="w-8 h-8" />
                )}
            </div>

            <h3 className="text-lg font-semibold text-white mb-2">
                {isReconciling
                    ? "Scanning your library…"
                    : lastError
                      ? "Scan failed"
                      : "Your library is empty"}
            </h3>

            <p className="text-sm text-white/60 mb-6">
                {isReconciling
                    ? progress?.phase
                          ? `${progress.phase[0].toUpperCase()}${progress.phase.slice(1).replace("-", " ")}…`
                          : "Working…"
                    : lastError
                      ? lastError
                      : "Drop music into your configured directory, then run a scan to import it."}
            </p>

            {isReconciling ? (
                <div className="space-y-2">
                    {pct !== null ? (
                        <Progress value={pct} className="h-1.5" />
                    ) : (
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                            <div className="h-full w-1/3 rounded-full bg-primary/60 animate-[indeterminate_1.4s_ease-in-out_infinite]" />
                        </div>
                    )}
                    <div className="flex justify-between text-xs text-white/50 tabular-nums">
                        <span>Scanned {progress?.scannedFiles ?? 0}</span>
                        <span>
                            {found > 0 ? `${imported}/${found} imported` : "Looking for files…"}
                        </span>
                    </div>
                </div>
            ) : (
                <Button onClick={handleScan} disabled={triggering} size="lg">
                    <RefreshCw className={cn("w-4 h-4 mr-2", triggering && "animate-spin")} />
                    Scan music directory
                </Button>
            )}
        </div>
    )
}
