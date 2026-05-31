import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Undo2 } from "lucide-react";
import { Pane, ErrorBanner } from "./primitives";
import { relTime, fmt } from "./utils";
import type { TrashResponse } from "./types";

export function TrashPane() {
    const [data, setData] = useState<TrashResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<Set<string>>(new Set());
    const queryClient = useQueryClient();

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/trash");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setData((await res.json()) as TrashResponse);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const restore = async (kind: "a" | "i", id: number) => {
        const key = `${kind}:${id}`;
        setBusy((s) => new Set(s).add(key));
        setError(null);
        try {
            const url = kind === "a" ? `/api/album/${id}/restore` : `/api/items/${id}/restore`;
            const res = await fetch(url, { method: "POST" });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.details ?? body.error ?? `HTTP ${res.status}`);
            }
            queryClient.invalidateQueries({ queryKey: ["albums"] });
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy((s) => {
                const next = new Set(s);
                next.delete(key);
                return next;
            });
        }
    };

    const albumCount = data?.albums.length ?? 0;
    const itemCount = data?.items.length ?? 0;
    const total = albumCount + itemCount;

    const summary = data
        ? `${fmt(albumCount)} album${albumCount === 1 ? "" : "s"}, ${fmt(itemCount)} track${itemCount === 1 ? "" : "s"}`
        : undefined;

    return (
        <Pane title="Trash" summary={summary}>
            {error && <ErrorBanner>{error}</ErrorBanner>}

            {!data ? (
                <p className="text-xs text-white/45 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading
                </p>
            ) : total === 0 ? (
                <p className="text-xs text-white/45">Nothing in the trash.</p>
            ) : (
                <ul className="divide-y divide-white/[0.04] max-h-80 overflow-y-auto">
                    {data.albums.map((a) => (
                        <TrashRow
                            key={`a-${a.id}`}
                            kind="Album"
                            primary={a.album}
                            secondary={[
                                a.albumartist,
                                a.year != null ? String(a.year) : null,
                                `${a.itemCount} track${a.itemCount === 1 ? "" : "s"}`,
                            ]
                                .filter(Boolean)
                                .join(", ")}
                            timestamp={a.marked_for_deletion}
                            busy={busy.has(`a:${a.id}`)}
                            onRestore={() => restore("a", a.id)}
                        />
                    ))}
                    {data.items.map((it) => {
                        const filename = it.path.split("/").pop() ?? it.path;
                        return (
                            <TrashRow
                                key={`i-${it.id}`}
                                kind="Track"
                                primary={it.title ?? filename}
                                secondary={[it.artist ?? "unknown artist", it.album]
                                    .filter(Boolean)
                                    .join(", ")}
                                timestamp={it.marked_for_deletion}
                                busy={busy.has(`i:${it.id}`)}
                                onRestore={() => restore("i", it.id)}
                            />
                        );
                    })}
                </ul>
            )}
        </Pane>
    );
}

function TrashRow({
    primary,
    secondary,
    timestamp,
    kind,
    busy,
    onRestore,
}: {
    primary: string;
    secondary: string;
    timestamp: number;
    kind: "Album" | "Track";
    busy: boolean;
    onRestore: () => void;
}) {
    return (
        <li className="grid grid-cols-[60px_1fr_auto_auto] items-center gap-4 py-2.5">
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium">
                {kind}
            </span>
            <div className="min-w-0">
                <p className="text-sm text-white/90 truncate">{primary}</p>
                <p className="text-xs text-white/50 truncate">{secondary}</p>
            </div>
            <span className="text-[11px] text-white/40 tabular-nums whitespace-nowrap hidden sm:inline">
                {relTime(timestamp)}
            </span>
            <button
                type="button"
                onClick={onRestore}
                disabled={busy}
                className="text-xs text-white/70 hover:text-white disabled:opacity-50 flex items-center gap-1 px-2 py-1 rounded hover:bg-white/[0.04] transition-colors"
            >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                Restore
            </button>
        </li>
    );
}
