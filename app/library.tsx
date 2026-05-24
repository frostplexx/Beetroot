"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AlbumCard from "@/components/album_card";
import { AlbumContextMenu } from "@/components/album-context-menu";
import type { AlbumCardData } from "@/lib/music/database/albums";
import { useLibrarySync } from "@/hooks/use-library-sync";
import { ChevronLeft, ChevronRight } from "lucide-react";

const FIRST_ROW_COLS_XL = 6;
const PAGE_SIZE_COOKIE = "library-page-size";
const GRID_GAP_PX = 16;

interface LibraryProps {
    albums: AlbumCardData[];
    page: number;
    totalPages: number;
    pageSize: number;
}

export default function Library({ albums, page, totalPages, pageSize }: LibraryProps) {
    const router = useRouter();
    const gridRef = useRef<HTMLDivElement>(null);

    const syncState = useLibrarySync(() => {
        router.refresh();
    });

    // Measure how many album cards fit the available grid area and persist
    // that count to a cookie so the server uses it on the next render. We only
    // refresh if the measurement differs from the server-rendered pageSize, so
    // returning users skip the round-trip entirely.
    useEffect(() => {
        const calculate = () => {
            const el = gridRef.current;
            if (!el) return;

            const rect = el.getBoundingClientRect();
            const availableHeight = rect.height;
            const availableWidth = el.clientWidth;

            const width = window.innerWidth;
            let cols = 6;
            if (width < 640) cols = 2;
            else if (width < 768) cols = 2;
            else if (width < 1024) cols = 3;
            else if (width < 1280) cols = 4;

            const cardWidth = (availableWidth - (cols - 1) * GRID_GAP_PX) / cols;
            const cardHeight = cardWidth;
            const rows = Math.max(1, Math.floor((availableHeight + GRID_GAP_PX) / (cardHeight + GRID_GAP_PX)));
            const target = rows * cols;
            if (target <= 0) return;
            if (target === pageSize) return;

            document.cookie = `${PAGE_SIZE_COOKIE}=${target}; path=/; max-age=31536000; samesite=lax`;
            router.refresh();
        };

        const initial = setTimeout(calculate, 50);
        let resizeTimer: ReturnType<typeof setTimeout> | null = null;
        const onResize = () => {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(calculate, 200);
        };
        window.addEventListener("resize", onResize);
        return () => {
            clearTimeout(initial);
            if (resizeTimer) clearTimeout(resizeTimer);
            window.removeEventListener("resize", onResize);
        };
    }, [pageSize, router]);

    if (albums.length === 0) {
        return (
            <div className="flex items-center justify-center w-full h-64">
                <p className="text-white/60">No albums in library</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-4 flex flex-col h-full overflow-hidden">
            {syncState.isReconciling && (
                <div className="mb-4 p-3 bg-white/10 border border-white/20 backdrop-blur-sm rounded-lg flex-shrink-0">
                    <p className="text-sm text-white">Scanning for new music...</p>
                </div>
            )}

            <div className="w-full mb-4 flex-shrink-0">
                <p className="text-sm text-white/60">
                    {albums.length} albums on this page
                    {syncState.isReconciling && " (updating...)"}
                </p>
            </div>

            <div
                ref={gridRef}
                className="grid w-full gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 flex-grow flex-shrink-0 overflow-hidden content-start"
            >
                {albums.map((album, idx) => (
                    <AlbumContextMenu key={album.id} album={album}>
                        <AlbumCard album={album} priority={idx < FIRST_ROW_COLS_XL} />
                    </AlbumContextMenu>
                ))}
            </div>

            {totalPages > 1 && <Pagination page={page} totalPages={totalPages} />}
        </div>
    );
}

function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
    const pages = getPageNumbers(page, totalPages);
    const prev = Math.max(1, page - 1);
    const next = Math.min(totalPages, page + 1);

    return (
        <div className="flex items-center justify-center gap-2 mt-8 flex-shrink-0">
            <PageLink
                href={pageHref(prev)}
                disabled={page === 1}
                ariaLabel="Previous page"
                className="p-2"
            >
                <ChevronLeft className="w-4 h-4" />
            </PageLink>

            <div className="flex gap-1">
                {pages.map((n) => (
                    <Link
                        key={n}
                        href={pageHref(n)}
                        prefetch
                        className={`min-w-9 h-9 px-2 inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all ${
                            page === n
                                ? "bg-white/20 text-white border border-white/30"
                                : "text-white/70 hover:text-white hover:bg-white/10"
                        }`}
                    >
                        {n}
                    </Link>
                ))}
            </div>

            <PageLink
                href={pageHref(next)}
                disabled={page === totalPages}
                ariaLabel="Next page"
                className="p-2"
            >
                <ChevronRight className="w-4 h-4" />
            </PageLink>
        </div>
    );
}

function PageLink({
    href,
    disabled,
    ariaLabel,
    className,
    children,
}: {
    href: string;
    disabled: boolean;
    ariaLabel: string;
    className: string;
    children: React.ReactNode;
}) {
    const base =
        "rounded-lg bg-white/10 border border-white/20 backdrop-blur-sm hover:bg-white/20 hover:border-white/30 transition-all";
    if (disabled) {
        return (
            <span
                aria-disabled
                aria-label={ariaLabel}
                className={`${base} ${className} opacity-40 pointer-events-none`}
            >
                {children}
            </span>
        );
    }
    return (
        <Link
            href={href}
            prefetch
            aria-label={ariaLabel}
            className={`${base} ${className} inline-flex items-center justify-center`}
        >
            {children}
        </Link>
    );
}

function pageHref(n: number): string {
    return n <= 1 ? "/" : `/?page=${n}`;
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
