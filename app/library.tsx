"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import AlbumCard from "@/components/album_card";
import { AlbumContextMenu } from "@/components/album-context-menu";
import type { AlbumCardData } from "@/lib/music/database/albums";
import { useLibrarySync } from "@/hooks/use-library-sync";
import {
    Pagination as ShadcnPagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";

const FIRST_ROW_COLS_XL = 6;

interface LibraryProps {
    albums: AlbumCardData[];
    page: number;
    totalPages: number;
    totalAlbums: number;
}

export default function Library({ albums, page, totalPages, totalAlbums }: LibraryProps) {
    const router = useRouter();
    const gridRef = useRef<HTMLDivElement>(null);

    const syncState = useLibrarySync(() => {
        router.refresh();
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
            router.push(target <= 1 ? "/" : `/?page=${target}`);
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [page, totalPages, router]);

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
                {syncState.isReconciling && (
                    <div className="mb-4 px-4 py-2.5 bg-white/[0.08] border border-white/10 backdrop-blur-md rounded-full flex-shrink-0 flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2 duration-300 w-fit">
                        <span className="w-2 h-2 rounded-full bg-white/70 animate-pulse" />
                        <p className="text-sm text-white/90">Scanning for new music...</p>
                    </div>
                )}

                <div className="w-full mb-4 flex-shrink-0">
                    <p className="text-xs uppercase tracking-[0.12em] text-white/50 font-medium">
                        {albums.length} of {totalAlbums.toLocaleString()} albums
                        {syncState.isReconciling && " · updating"}
                    </p>
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

                {totalPages > 1 && <Pagination page={page} totalPages={totalPages} />}
            </div>
        </div>
    );
}

function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
    const pages = getPageNumbers(page, totalPages);
    const prev = Math.max(1, page - 1);
    const next = Math.min(totalPages, page + 1);

    return (
        <ShadcnPagination className="mt-auto pt-6 flex-shrink-0">
            <PaginationContent>
                <PaginationItem>
                    <PaginationPrevious href={pageHref(prev)} disabled={page === 1} />
                </PaginationItem>

                {pages.map((n) => (
                    <PaginationItem key={n}>
                        <PaginationLink href={pageHref(n)} isActive={page === n}>
                            {n}
                        </PaginationLink>
                    </PaginationItem>
                ))}

                <PaginationItem>
                    <PaginationNext href={pageHref(next)} disabled={page === totalPages} />
                </PaginationItem>
            </PaginationContent>
        </ShadcnPagination>
    );
}

function pageHref(n: number): string {
    return n <= 1 ? "/" : `/?page=${n}`;
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
