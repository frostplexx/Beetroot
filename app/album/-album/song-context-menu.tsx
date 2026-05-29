import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter, useLocation } from "@tanstack/react-router";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    FolderInput,
    FolderOpen,
    Copy,
    Trash2,
    Info,
    Loader2,
    Search,
    AlertTriangle,
    CheckCircle2,
    FileQuestion,
} from "lucide-react";
import type { Item } from "@/lib/music/database";

type AlbumSummary = {
    id: number;
    album: string;
    albumartist: string;
    year: number | null;
    added: number;
    missing_since: number | null;
};

// ---- Move-to-album dialog ----
function MoveToAlbumDialog({
    open,
    onOpenChange,
    item,
    onMoved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    item: Item;
    onMoved: (result: { previousAlbumId: number | null; previousAlbumDeleted: boolean }) => void;
}) {
    const [query, setQuery] = React.useState("");
    const [albums, setAlbums] = React.useState<AlbumSummary[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [moving, setMoving] = React.useState<number | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    // Fetch albums when dialog opens or query changes (debounced)
    React.useEffect(() => {
        if (!open) return;

        let cancelled = false;
        const trimmed = query.trim();

        const timer = setTimeout(async () => {
            setLoading(true);
            setError(null);
            try {
                const url = trimmed
                    ? `/api/search?q=${encodeURIComponent(trimmed)}&pageSize=30`
                    : `/api/albums?page=0&pageSize=30`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!cancelled) setAlbums(data.albums ?? []);
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : String(e));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, trimmed ? 200 : 0);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [open, query]);

    // Reset state when dialog closes
    React.useEffect(() => {
        if (!open) {
            setQuery("");
            setError(null);
            setMoving(null);
        }
    }, [open]);

    const handleSelect = async (albumId: number) => {
        if (moving !== null) return;
        setMoving(albumId);
        setError(null);
        try {
            const res = await fetch(`/api/items/${item.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ album_id: albumId }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            const data = (await res.json().catch(() => ({}))) as {
                previousAlbumId?: number | null;
                previousAlbumDeleted?: boolean;
            };
            onMoved({
                previousAlbumId: data.previousAlbumId ?? null,
                previousAlbumDeleted: !!data.previousAlbumDeleted,
            });
            onOpenChange(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setMoving(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Move song to album</DialogTitle>
                    <DialogDescription>
                        Choose a target album for{" "}
                        <span className="text-foreground">{item.title || "this song"}</span>.
                    </DialogDescription>
                </DialogHeader>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/65" />
                    <Input
                        autoFocus
                        placeholder="Search albums..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="pl-9 bg-white/10 border-white/20 placeholder:text-white/75"
                    />
                </div>

                {error && (
                    <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <div className="max-h-80 overflow-y-auto -mx-1">
                    {loading && albums.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-sm text-white/65">
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Searching…
                        </div>
                    ) : albums.length === 0 ? (
                        <div className="py-8 text-center text-sm text-white/65">
                            No albums found.
                        </div>
                    ) : (
                        <ul className="space-y-0.5">
                            {albums.map((album) => {
                                const isCurrent = album.id === item.album_id;
                                const isMoving = moving === album.id;
                                return (
                                    <li key={album.id}>
                                        <button
                                            disabled={isCurrent || moving !== null}
                                            onClick={() => handleSelect(album.id)}
                                            className="w-full text-left flex items-center gap-3 px-2 py-2 rounded-md hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <div className="w-9 h-9 rounded shrink-0 overflow-hidden bg-white/10 flex items-center justify-center">
                                                {album.missing_since ? (
                                                    <FileQuestion className="w-5 h-5 text-red-400/60" />
                                                ) : (
                                                    <img
                                                        src={`/api/album/${album.id}/art?size=64&t=${album.added}`}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => {
                                                            (e.target as HTMLImageElement).style.visibility =
                                                                "hidden";
                                                        }}
                                                    />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium truncate">
                                                    {album.album}
                                                </div>
                                                <div className="text-xs text-white/65 truncate">
                                                    {album.albumartist}
                                                    {album.year ? ` · ${album.year}` : ""}
                                                </div>
                                            </div>
                                            {isCurrent && (
                                                <span className="text-xs text-white/75 shrink-0">
                                                    Current
                                                </span>
                                            )}
                                            {isMoving && (
                                                <Loader2 className="w-4 h-4 animate-spin text-white/75" />
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ---- Confirm delete dialog ----
function ConfirmDeleteDialog({
    open,
    onOpenChange,
    item,
    onDeleted,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    item: Item;
    onDeleted: (result: { previousAlbumId: number | null; previousAlbumDeleted: boolean }) => void;
}) {
    const [deleteFile, setDeleteFile] = React.useState(false);
    const [pending, setPending] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open) {
            setDeleteFile(false);
            setError(null);
            setPending(false);
        }
    }, [open]);

    const handleDelete = async () => {
        setPending(true);
        setError(null);
        try {
            const url = `/api/items/${item.id}${deleteFile ? "?deleteFile=true" : ""}`;
            const res = await fetch(url, { method: "DELETE" });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            const data = (await res.json().catch(() => ({}))) as {
                previousAlbumId?: number | null;
                previousAlbumDeleted?: boolean;
            };
            onDeleted({
                previousAlbumId: data.previousAlbumId ?? null,
                previousAlbumDeleted: !!data.previousAlbumDeleted,
            });
            onOpenChange(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setPending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete song from library?</DialogTitle>
                    <DialogDescription>
                        Removes <span className="text-foreground">{item.title || "this song"}</span>{" "}
                        from the library database. This can&rsquo;t be undone.
                    </DialogDescription>
                </DialogHeader>

                <label className="flex items-start gap-2 text-sm text-white/85 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={deleteFile}
                        onChange={(e) => setDeleteFile(e.target.checked)}
                        className="mt-1"
                    />
                    <span>
                        Also move the file to trash
                        <div className="text-xs text-white/75 mt-0.5">
                            Moves <code className="font-mono">{item.path}</code> to the trash folder
                        </div>
                    </span>
                </label>

                {error && (
                    <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

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
                        onClick={handleDelete}
                        disabled={pending}
                    >
                        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 />}
                        Delete
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ---- Info dialog ----
function InfoDialog({
    open,
    onOpenChange,
    item,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    item: Item;
}) {
    const rows: Array<[string, React.ReactNode]> = [
        ["Title", item.title || "—"],
        ["Artist", item.artist || "—"],
        ["Album", item.album || "—"],
        ["Album artist", item.albumartist || "—"],
        ["Year", item.year ?? "—"],
        ["Track", item.track ?? "—"],
        ["Disc", item.disc ?? "—"],
        ["Length", item.length ? `${Math.floor(item.length / 60)}:${String(Math.floor(item.length % 60)).padStart(2, "0")}` : "—"],
        ["Format", item.format || "—"],
        ["Bitrate", item.bitrate ? `${item.bitrate} kbps` : "—"],
        ["Sample rate", item.samplerate ? `${item.samplerate} Hz` : "—"],
        ["MB track id", item.mb_trackid || "—"],
        ["MB release id", item.mb_albumid || "—"],
        ["Path", <code key="p" className="font-mono text-xs break-all">{item.path}</code>],
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Song details</DialogTitle>
                </DialogHeader>
                <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-sm">
                    {rows.map(([k, v]) => (
                        <React.Fragment key={k}>
                            <dt className="text-white/65">{k}</dt>
                            <dd className="text-white/90 min-w-0">{v}</dd>
                        </React.Fragment>
                    ))}
                </dl>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ---- Main component ----
type Toast = { kind: "ok" | "error"; message: string };

export function SongContextMenu({
    item,
    children,
}: {
    item: Item;
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = useLocation({ select: (s) => s.pathname });
    const [moveOpen, setMoveOpen] = React.useState(false);
    const [deleteOpen, setDeleteOpen] = React.useState(false);
    const [infoOpen, setInfoOpen] = React.useState(false);
    const [toast, setToast] = React.useState<Toast | null>(null);
    const [mounted, setMounted] = React.useState(false);

    // createPortal needs the document, only available client-side. Defer
    // toast rendering until after mount so SSR/hydration output stays clean.
    React.useEffect(() => setMounted(true), []);

    // If the previous album was emptied (and deleted) by a move/delete and
    // we're sitting on its page, navigate home so the user doesn't see an
    // "album not found" stub.
    const handleSourceAlbumDeleted = (previousAlbumId: number | null) => {
        if (previousAlbumId == null) return;
        if (pathname?.startsWith(`/album/${previousAlbumId}`)) {
            router.navigate({ to: "/", search: { page: 1, sort: "recently-added" as const } });
        }
    };

    const showToast = (t: Toast) => {
        setToast(t);
        setTimeout(() => setToast(null), 3000);
    };

    const handleCopyPath = async () => {
        try {
            await navigator.clipboard.writeText(item.path);
            showToast({ kind: "ok", message: "Path copied to clipboard" });
        } catch (e) {
            showToast({
                kind: "error",
                message: `Copy failed: ${e instanceof Error ? e.message : String(e)}`,
            });
        }
    };

    const handleReveal = async () => {
        try {
            const res = await fetch(`/api/items/${item.id}/reveal`, { method: "POST" });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            showToast({ kind: "ok", message: "Revealed in Finder" });
        } catch (e) {
            showToast({
                kind: "error",
                message: e instanceof Error ? e.message : String(e),
            });
        }
    };

    return (
        <>
            <ContextMenu>
                <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                    <ContextMenuItem onSelect={() => setMoveOpen(true)}>
                        <FolderInput />
                        Move to album…
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => setInfoOpen(true)}>
                        <Info />
                        Song details
                        <ContextMenuShortcut>⌘I</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={handleReveal}>
                        <FolderOpen />
                        Show in Finder
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={handleCopyPath}>
                        <Copy />
                        Copy file path
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                        <Trash2 />
                        Delete from library…
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            <MoveToAlbumDialog
                open={moveOpen}
                onOpenChange={setMoveOpen}
                item={item}
                onMoved={({ previousAlbumId, previousAlbumDeleted }) => {
                    showToast({
                        kind: "ok",
                        message: previousAlbumDeleted
                            ? "Song moved (source album was emptied and removed)"
                            : "Song moved",
                    });
                    if (previousAlbumDeleted) {
                        handleSourceAlbumDeleted(previousAlbumId);
                    } else {
                        router.invalidate();
                    }
                }}
            />
            <ConfirmDeleteDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                item={item}
                onDeleted={({ previousAlbumId, previousAlbumDeleted }) => {
                    showToast({
                        kind: "ok",
                        message: previousAlbumDeleted
                            ? "Song deleted (album was emptied and removed)"
                            : "Song deleted",
                    });
                    if (previousAlbumDeleted) {
                        handleSourceAlbumDeleted(previousAlbumId);
                    } else {
                        router.invalidate();
                    }
                }}
            />
            <InfoDialog open={infoOpen} onOpenChange={setInfoOpen} item={item} />

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
    );
}
