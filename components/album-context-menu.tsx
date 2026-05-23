"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
    AlertTriangle,
    CheckCircle2,
    Copy,
    Disc3,
    FolderOpen,
    Loader2,
    Trash2,
} from "lucide-react"
import type { Album } from "@/lib/music/database"

type Toast = { kind: "ok" | "error"; message: string }

export function AlbumContextMenu({
    album,
    children,
}: {
    album: Album
    children: React.ReactNode
}) {
    const router = useRouter()
    const [deleteOpen, setDeleteOpen] = React.useState(false)
    const [toast, setToast] = React.useState<Toast | null>(null)
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => setMounted(true), [])

    const showToast = (t: Toast) => {
        setToast(t)
        setTimeout(() => setToast(null), 3000)
    }

    const handleOpen = () => router.push(`/album/${album.id}`)

    const handleReveal = async () => {
        try {
            const res = await fetch(`/api/album/${album.id}/reveal`, { method: "POST" })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || `HTTP ${res.status}`)
            }
            showToast({ kind: "ok", message: "Revealed in Finder" })
        } catch (e) {
            showToast({
                kind: "error",
                message: e instanceof Error ? e.message : String(e),
            })
        }
    }

    const handleCopyFolder = async () => {
        try {
            const res = await fetch(`/api/album/${album.id}/folder`)
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || `HTTP ${res.status}`)
            }
            const { folder } = (await res.json()) as { folder: string }
            await navigator.clipboard.writeText(folder)
            showToast({ kind: "ok", message: "Folder path copied" })
        } catch (e) {
            showToast({
                kind: "error",
                message: `Copy failed: ${e instanceof Error ? e.message : String(e)}`,
            })
        }
    }

    const isMissing = album.missing_since != null

    return (
        <>
            <ContextMenu>
                <ContextMenuTrigger>{children}</ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                    <ContextMenuItem onSelect={handleOpen}>
                        <Disc3 />
                        Open album
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={handleReveal} disabled={isMissing}>
                        <FolderOpen />
                        Show in Finder
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={handleCopyFolder}>
                        <Copy />
                        Copy folder path
                    </ContextMenuItem>
                    {isMissing && (
                        <>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                                variant="destructive"
                                onSelect={() => setDeleteOpen(true)}
                            >
                                <Trash2 />
                                Remove from library…
                            </ContextMenuItem>
                        </>
                    )}
                </ContextMenuContent>
            </ContextMenu>

            <ConfirmRemoveDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                album={album}
                onRemoved={() => {
                    showToast({ kind: "ok", message: "Album removed" })
                    router.refresh()
                }}
                onError={(message) => showToast({ kind: "error", message })}
            />

            {mounted && toast
                ? createPortal(
                      <div
                          className={`fixed bottom-6 right-6 z-50 rounded-md border px-4 py-2 text-sm shadow-lg backdrop-blur-md ${
                              toast.kind === "ok"
                                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
                                  : "border-red-500/40 bg-red-500/15 text-red-100"
                          }`}
                      >
                          <span className="inline-flex items-center gap-2">
                              {toast.kind === "ok" ? (
                                  <CheckCircle2 className="w-4 h-4" />
                              ) : (
                                  <AlertTriangle className="w-4 h-4" />
                              )}
                              {toast.message}
                          </span>
                      </div>,
                      document.body
                  )
                : null}
        </>
    )
}

function ConfirmRemoveDialog({
    open,
    onOpenChange,
    album,
    onRemoved,
    onError,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    album: Album
    onRemoved: () => void
    onError: (message: string) => void
}) {
    const [pending, setPending] = React.useState(false)

    React.useEffect(() => {
        if (!open) setPending(false)
    }, [open])

    const handleRemove = async () => {
        setPending(true)
        try {
            const res = await fetch(`/api/album/${album.id}`, { method: "DELETE" })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
            onOpenChange(false)
            onRemoved()
        } catch (e) {
            onError(e instanceof Error ? e.message : String(e))
        } finally {
            setPending(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Remove missing album?</DialogTitle>
                    <DialogDescription>
                        <strong className="text-foreground">{album.album}</strong> has no
                        files on disk. Removing it deletes the album and its track rows from
                        the database. No files are touched.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={pending}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleRemove}
                        disabled={pending}
                    >
                        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 />}
                        Remove
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
