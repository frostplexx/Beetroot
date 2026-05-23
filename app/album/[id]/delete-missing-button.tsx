"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface DeleteMissingButtonProps {
    albumId: number
    albumName: string
}

export function DeleteMissingButton({ albumId, albumName }: DeleteMissingButtonProps) {
    const router = useRouter()
    const [open, setOpen] = React.useState(false)
    const [deleting, setDeleting] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const onConfirm = async () => {
        setDeleting(true)
        setError(null)
        try {
            const res = await fetch(`/api/album/${albumId}`, { method: "DELETE" })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data?.error || "Failed to delete album")
            }
            setOpen(false)
            router.push("/")
            router.refresh()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete album")
        } finally {
            setDeleting(false)
        }
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-200 text-sm font-semibold backdrop-blur-sm hover:bg-red-500/25 hover:border-red-400/60 hover:text-white hover:scale-105 active:scale-95 transition-all"
            >
                <Trash2 className="w-4 h-4" />
                Remove from library
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remove missing album?</DialogTitle>
                        <DialogDescription className="text-muted-foreground/80">
                            <strong className="text-foreground">{albumName}</strong> has no files
                            on disk. Removing it deletes the album and its track rows from the
                            database. Files have already been moved or deleted outside of Beetroot
                            so nothing on disk changes.
                        </DialogDescription>
                    </DialogHeader>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-sm text-red-200">
                            {error}
                        </div>
                    )}

                    <DialogFooter className="gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={deleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={onConfirm}
                            disabled={deleting}
                            className="bg-red-500/90 hover:bg-red-500 text-white"
                        >
                            {deleting ? "Removing…" : "Remove"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
