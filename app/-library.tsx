import { useCallback, useEffect, useMemo, useRef } from "react";
import { ChevronDownIcon } from "lucide-react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useResizeObserver } from "usehooks-ts";
import { useNavigate } from "@tanstack/react-router";
import AlbumCard from "@/components/album_card";
import { AlbumContextMenu } from "@/components/album-context-menu";
import type { AlbumCardData, AlbumSort } from "@/lib/music/database/albums";
import { useLibrarySync } from "@/hooks/use-library-sync";
import {
    Pagination as ShadcnPagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const GAP = 16;          // gap-4
const TARGET_CARD = 180; // px — desired card width; cols derived from this
const MIN_COLS = 2;
const MAX_COLS = 8;

const SORT_LABELS: Record<AlbumSort, string> = {
    "recently-added": "Recently Added",
    "name":           "Name",
    "artist":         "Artist",
    "year":           "Year",
};

type AlbumsResponse = {
    albums: AlbumCardData[];
    pagination: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
};

async function fetchAlbums(uiPage: number, pageSize: number, sort: AlbumSort): Promise<AlbumsResponse> {
    const params = new URLSearchParams();
    params.set("page", String(uiPage - 1)); // API is 0-indexed
    params.set("pageSize", String(pageSize));
    if (sort !== "recently-added") params.set("sort", sort);

    const res = await fetch(`/api/albums?${params}`);
    if (!res.ok) throw new Error(`albums fetch failed: ${res.status}`);
    return res.json();
}

function warmImages(albums: AlbumCardData[] | undefined) {
    albums?.forEach((album) => {
        if (!album.artpath || album.missing_since) return;
        const img = new window.Image();
        img.src = `/api/album/${album.id}/art?size=400`;
    });
}

export default function Library({ page, sort }: { page: number; sort: AlbumSort }) {
    const queryClient = useQueryClient();
    const gridRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate({ from: "/" });

    const setPage = useCallback(
        (p: number, replace = false) => navigate({ search: (old) => ({ ...old, page: p }), replace }),
        [navigate],
    );

    const setSort = useCallback(
        (s: AlbumSort) => navigate({ search: (old) => ({ ...old, sort: s, page: 1 }) }),
        [navigate],
    );

    // ── Concern 1: how many cards fit ────────────────────────────────────────
    const { width = 0, height = 0 } = useResizeObserver({
        ref: gridRef,
        box: "border-box",
    });

    const { cols, pageSize } = useMemo(() => {
        if (width <= 0 || height <= 0) return { cols: 0, pageSize: 0 };
        const cols = Math.max(MIN_COLS, Math.min(MAX_COLS, Math.floor((width + GAP) / (TARGET_CARD + GAP))));
        const cardSize = (width - (cols - 1) * GAP) / cols; // square cards → height ≈ width
        const rows = Math.max(1, Math.floor((height + GAP) / (cardSize + GAP)));
        return { cols, pageSize: cols * rows };
    }, [width, height]);

    // ── Concern 2: fetch + paginate exactly that many ────────────────────────
    const { data, isLoading } = useQuery({
        queryKey: ["albums", page, pageSize, sort],
        queryFn: () => fetchAlbums(page, pageSize, sort),
        enabled: pageSize > 0,
        placeholderData: keepPreviousData, // no blank flash on page/size change
    });

    const albums = data?.albums ?? [];
    const total = data?.pagination.total ?? 0;
    const totalPages = data?.pagination.totalPages ?? 1;

    // Clamp page if a resize shrank the page count.
    // ONLY clamp if we have data and aren't loading, to avoid resetting ?page=N to 1 during initial load.
    useEffect(() => {
        if (!isLoading && data && page > totalPages) {
            setPage(totalPages, true);
        }
    }, [page, totalPages, setPage, isLoading, data]);

    // Prefetch next page (data + images) so forward nav feels instant.
    useEffect(() => {
        if (pageSize <= 0 || page >= totalPages) return;
        const next = page + 1;
        queryClient
            .fetchQuery({
                queryKey: ["albums", next, pageSize, sort],
                queryFn: () => fetchAlbums(next, pageSize, sort),
            })
            .then((d) => warmImages(d.albums))
            .catch(() => {});
    }, [page, totalPages, pageSize, sort, queryClient]);

    // Library sync → invalidate instead of full refresh. Defer while hidden.
    const pendingInvalidate = useRef(false);
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === "visible" && pendingInvalidate.current) {
                pendingInvalidate.current = false;
                queryClient.invalidateQueries({ queryKey: ["albums"] });
            }
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [queryClient]);

    useLibrarySync(() => {
        if (document.visibilityState === "visible") {
            queryClient.invalidateQueries({ queryKey: ["albums"] });
        } else {
            pendingInvalidate.current = true;
        }
    });

    // Keyboard nav.
    useEffect(() => {
        if (totalPages <= 1) return;
        const handler = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (isTypingTarget(e.target)) return;
            let target: number | null = null;
            switch (e.key) {
                case "ArrowLeft":  if (page > 1)            target = page - 1;     break;
                case "ArrowRight": if (page < totalPages)   target = page + 1;     break;
                case "Home":       if (page !== 1)          target = 1;            break;
                case "End":        if (page !== totalPages) target = totalPages;   break;
                default: return;
            }
            if (target == null) return;
            e.preventDefault();
            setPage(target);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [page, totalPages]);

    const gridStyle = cols > 0 ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined;

    return (
        <div className="absolute inset-0 overflow-hidden">
            <div className="container mx-auto px-4 py-4 flex flex-col h-full">
                <div className="w-full mb-4 flex-shrink-0 flex items-center justify-between gap-4">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-white/30 font-medium">
                        {total > 0 ? `${albums.length} of ${total.toLocaleString()} albums` : "\u00A0"}
                    </p>
                    <SortSelector sort={sort} onChange={setSort} />
                </div>

                <div
                    ref={gridRef}
                    style={gridStyle}
                    // auto-fill is the pre-measure fallback; inline cols take over once measured.
                    className="grid w-full gap-4 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] flex-1 min-h-0 overflow-hidden content-start"
                >
                    {albums.map((album, idx) => (
                        <AlbumContextMenu key={album.id} album={album}>
                            <AlbumCard album={album} priority={idx < cols} />
                        </AlbumContextMenu>
                    ))}
                </div>

                {!isLoading && total === 0 && (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-white/60">No albums in library</p>
                    </div>
                )}

                <div className="mt-auto pt-6 flex-shrink-0 min-h-[60px]">
                    {totalPages > 1 && (
                        <Pagination
                            page={page}
                            totalPages={totalPages}
                            onPage={setPage}
                            onHoverPage={(n) =>
                                queryClient
                                    .fetchQuery({
                                        queryKey: ["albums", n, pageSize, sort],
                                        queryFn: () => fetchAlbums(n, pageSize, sort),
                                    })
                                    .then((d) => warmImages(d.albums))
                                    .catch(() => {})
                            }
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

function Pagination({
    page,
    totalPages,
    onPage,
    onHoverPage,
}: {
    page: number;
    totalPages: number;
    onPage: (n: number) => void;
    onHoverPage: (n: number) => void;
}) {
    const pages = getPageNumbers(page, totalPages);
    const prev = Math.max(1, page - 1);
    const next = Math.min(totalPages, page + 1);
    const go = useCallback((n: number) => (e: React.MouseEvent) => { e.preventDefault(); onPage(n); }, [onPage]);

    return (
        <ShadcnPagination>
            <PaginationContent>
                <PaginationItem>
                    <PaginationPrevious
                        href="#"
                        disabled={page === 1}
                        onClick={go(prev)}
                        onMouseEnter={() => page > 1 && onHoverPage(prev)}
                    />
                </PaginationItem>

                {pages.map((n) => (
                    <PaginationItem key={n}>
                        <PaginationLink
                            href="#"
                            isActive={page === n}
                            onClick={go(n)}
                            onMouseEnter={() => onHoverPage(n)}
                        >
                            {n}
                        </PaginationLink>
                    </PaginationItem>
                ))}

                <PaginationItem>
                    <PaginationNext
                        href="#"
                        disabled={page === totalPages}
                        onClick={go(next)}
                        onMouseEnter={() => page < totalPages && onHoverPage(next)}
                    />
                </PaginationItem>
            </PaginationContent>
        </ShadcnPagination>
    );
}

function SortSelector({ sort, onChange }: { sort: AlbumSort; onChange: (s: AlbumSort) => void }) {
    const options = Object.keys(SORT_LABELS) as AlbumSort[];
    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] font-medium text-white/30 hover:text-white/60 transition-colors outline-none">
                {SORT_LABELS[sort]}
                <ChevronDownIcon className="size-3 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuRadioGroup value={sort} onValueChange={(v) => onChange(v as AlbumSort)}>
                    {options.map((option) => (
                        <DropdownMenuRadioItem key={option} value={option}>
                            {SORT_LABELS[option]}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function getPageNumbers(currentPage: number, totalPages: number): number[] {
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
}
