import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
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

interface DeleteAlbumButtonProps {
    albumId: number
    albumName: string
    isMissing: boolean
}

export function DeleteAlbumButton({ albumId, albumName, isMissing }: DeleteAlbumButtonProps) {
    const router = useRouter()
    const queryClient = useQueryClient()
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
            await queryClient.invalidateQueries({ queryKey: ["albums"] })
            router.navigate({ to: "/", search: { page: 1, sort: "recently-added" as const } })
            router.invalidate()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete album")
        } finally {
            setDeleting(false)
        }
    }

    const handleOpenChange = (next: boolean) => {
        setOpen(next)
        if (!next) {
            setError(null)
        }
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-red-500/[0.12] border border-red-500/30 text-red-200 text-sm font-medium backdrop-blur-md hover:bg-red-500/20 hover:border-red-400/50 hover:text-white transition-all duration-200 active:scale-[0.97] group"
            >
                <Trash2 className="w-4 h-4 transition-transform duration-200 group-hover:rotate-6" />
                Remove from library
            </button>

            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remove album?</DialogTitle>
                        <DialogDescription className="text-muted-foreground/80">
                            {isMissing ? (
                                <>
                                    <strong className="text-foreground">{albumName}</strong> has no
                                    files on disk. Removing it permanently deletes the album and its
                                    track rows from the database.
                                </>
                            ) : (
                                <>
                                    Move <strong className="text-foreground">{albumName}</strong> to
                                    trash. Files stay recoverable for the configured retention
                                    window, then are permanently deleted.
                                </>
                            )}
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
                            onClick={() => handleOpenChange(false)}
                            disabled={deleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={onConfirm}
                            disabled={deleting}
                        >
                            {deleting ? "Removing…" : "Remove"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

// Keep old export name as alias so any other consumers don't break
export { DeleteAlbumButton as DeleteMissingButton }
