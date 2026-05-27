"use client";

import { useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
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

const FIRST_ROW_COLS_XL = 6;

const SORT_LABELS: Record<AlbumSort, string> = {
    "recently-added": "Recently Added",
    "name":           "Name",
    "artist":         "Artist",
    "year":           "Year",
};

interface LibraryProps {
    albums: AlbumCardData[];
    page: number;
    totalPages: number;
    totalAlbums: number;
    sort: AlbumSort;
}

export default function Library({ albums, page, totalPages, totalAlbums, sort }: LibraryProps) {
    const router = useRouter();

    const setSort = useCallback((next: AlbumSort) => {
        const params = new URLSearchParams();
        if (next !== "recently-added") params.set("sort", next);
        const qs = params.toString();
        // Use pushState + refresh to skip the view transition that would otherwise
        // animate every album card to its new sorted position.
        window.history.pushState(null, "", qs ? `/?${qs}` : "/");
        router.refresh();
    }, [router]);
    const gridRef = useRef<HTMLDivElement>(null);
    const pendingRefresh = useRef(false);

    // Defer refresh until the tab is visible to avoid "Skipped ViewTransition
    // due to document being hidden" errors when reconcile fires in the background.
    useEffect(() => {
        const onVisible = () => {
            if (pendingRefresh.current) {
                pendingRefresh.current = false;
                router.refresh();
            }
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [router]);

    useLibrarySync(() => {
        if (document.visibilityState === "visible") {
            router.refresh();
        } else {
            pendingRefresh.current = true;
        }
    });

    // Cap the grid to a whole-row boundary so we never show a half-clipped row.
    // We measure once and on resize, set inline maxHeight; no router.refresh.
    useLayoutEffect(() => {
        const grid = gridRef.current;
        if (!grid) return;

        const GAP = 16;
        const colsAt = (w: number) => {
            if (w < 768) return 2;
            if (w < 1024) return 3;
            if (w < 1280) return 4;
            return 6;
        };

        const apply = () => {
            const width = grid.clientWidth;
            if (width <= 0) return;
            const cols = colsAt(window.innerWidth);
            const cardSize = (width - (cols - 1) * GAP) / cols;
            if (cardSize <= 0) return;

            // Read available height with the cap removed, then restore.
            const prev = grid.style.maxHeight;
            grid.style.maxHeight = "none";
            const available = grid.clientHeight;
            grid.style.maxHeight = prev;

            if (available <= 0) return;
            const rows = Math.max(1, Math.floor((available + GAP) / (cardSize + GAP)));
            const target = rows * cardSize + (rows - 1) * GAP;
            grid.style.maxHeight = `${Math.floor(target)}px`;
        };

        apply();

        let raf = 0;
        const onResize = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(apply);
        };
        window.addEventListener("resize", onResize);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", onResize);
        };
    }, []);

    // Prefetch next page images while the user is still on the current page.
    // Fetching with Image() warms the serve-art LRU on the server and populates
    // the browser cache so navigating forward feels instant instead of waiting
    // for 30 cold sharp resizes.
    useEffect(() => {
        if (page >= totalPages) return;

        const controller = new AbortController();
        const params = new URLSearchParams();
        // API is 0-indexed; next 1-based page N+1 → API page = N
        params.set("page", String(page));
        params.set("pageSize", "30");
        if (sort !== "recently-added") params.set("sort", sort);

        fetch(`/api/albums?${params}`, { signal: controller.signal })
            .then(r => r.json())
            .then((data: { albums: AlbumCardData[] }) => {
                data.albums?.forEach(album => {
                    if (!album.artpath || album.missing_since) return;
                    const img = new window.Image();
                    img.src = `/api/album/${album.id}/art?size=400`;
                });
            })
            .catch(() => {});

        return () => controller.abort();
    }, [page, totalPages, sort]);

    useEffect(() => {
        if (totalPages <= 1) return;

        const handler = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (isTypingTarget(e.target)) return;

            let target: number | null = null;
            switch (e.key) {
                case "ArrowLeft":
                    if (page > 1) target = page - 1;
                    break;
                case "ArrowRight":
                    if (page < totalPages) target = page + 1;
                    break;
                case "Home":
                    if (page !== 1) target = 1;
                    break;
                case "End":
                    if (page !== totalPages) target = totalPages;
                    break;
                default:
                    return;
            }

            if (target == null) return;
            e.preventDefault();
            router.push(pageHref(target, sort));
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [page, totalPages, sort, router]);

    if (albums.length === 0) {
        return (
            <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-white/60">No albums in library</p>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 overflow-hidden">
            <div className="container mx-auto px-4 py-4 flex flex-col h-full">
                <div className="w-full mb-4 flex-shrink-0 flex items-center justify-between gap-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-white/50 font-medium">
                        {albums.length} of {totalAlbums.toLocaleString()} albums
                    </p>
                    <SortSelector sort={sort} onChange={setSort} />
                </div>

                <div
                    ref={gridRef}
                    className="grid w-full gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 flex-1 min-h-0 overflow-hidden content-start"
                >
                    {albums.map((album, idx) => (
                        <AlbumContextMenu key={album.id} album={album}>
                            <AlbumCard album={album} priority={idx < FIRST_ROW_COLS_XL} />
                        </AlbumContextMenu>
                    ))}
                </div>

                {totalPages > 1 && <Pagination page={page} totalPages={totalPages} sort={sort} />}
            </div>
        </div>
    );
}

function Pagination({ page, totalPages, sort }: { page: number; totalPages: number; sort: AlbumSort }) {
    const pages = getPageNumbers(page, totalPages);
    const prev = Math.max(1, page - 1);
    const next = Math.min(totalPages, page + 1);
    const href = (n: number) => pageHref(n, sort);
    const prefetched = useRef(new Set<number>());

    const prefetchPageImages = useCallback((targetPage: number) => {
        if (prefetched.current.has(targetPage)) return;
        prefetched.current.add(targetPage);
        const params = new URLSearchParams();
        params.set("page", String(targetPage - 1));
        params.set("pageSize", "30");
        if (sort !== "recently-added") params.set("sort", sort);
        fetch(`/api/albums?${params}`)
            .then(r => r.json())
            .then((data: { albums: AlbumCardData[] }) => {
                data.albums?.forEach(album => {
                    if (!album.artpath || album.missing_since) return;
                    const img = new window.Image();
                    img.src = `/api/album/${album.id}/art?size=400`;
                });
            })
            .catch(() => {});
    }, [sort]);

    return (
        <ShadcnPagination className="mt-auto pt-6 flex-shrink-0">
            <PaginationContent>
                <PaginationItem>
                    <PaginationPrevious
                        href={href(prev)}
                        disabled={page === 1}
                        onMouseEnter={() => page > 1 && prefetchPageImages(prev)}
                    />
                </PaginationItem>

                {pages.map((n) => (
                    <PaginationItem key={n}>
                        <PaginationLink href={href(n)} isActive={page === n}>
                            {n}
                        </PaginationLink>
                    </PaginationItem>
                ))}

                <PaginationItem>
                    <PaginationNext
                        href={href(next)}
                        disabled={page === totalPages}
                        onMouseEnter={() => page < totalPages && prefetchPageImages(next)}
                    />
                </PaginationItem>
            </PaginationContent>
        </ShadcnPagination>
    );
}

function pageHref(n: number, sort: AlbumSort): string {
    const params = new URLSearchParams();
    if (n > 1) params.set("page", String(n));
    if (sort !== "recently-added") params.set("sort", sort);
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
}

function SortSelector({ sort, onChange }: { sort: AlbumSort; onChange: (s: AlbumSort) => void }) {
    const options = Object.keys(SORT_LABELS) as AlbumSort[];
    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] font-medium text-white/50 hover:text-white/80 transition-colors outline-none">
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
    if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1);
    }
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
}
