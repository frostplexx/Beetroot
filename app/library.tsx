"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const SCROLL_STORAGE_KEY = "library-scroll";
import AlbumCard from "@/components/album_card";
import { AlbumContextMenu } from "@/components/album-context-menu";
import { Album } from "@/lib/music/database/albums";
import { useLibrarySync } from "@/hooks/use-library-sync";
import { Disc3, ChevronLeft, ChevronRight } from "lucide-react";

export default function Library() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const pageParam = Number(searchParams.get("page"));
    const initialPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

    const [albums, setAlbums] = useState<Album[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [totalPages, setTotalPages] = useState(1);
    const pageSize = 30;
    const previousPageRef = useRef(initialPage);

    // Sync URL with currentPage state
    useEffect(() => {
        if (currentPage === previousPageRef.current) return;
        previousPageRef.current = currentPage;

        const params = new URLSearchParams(searchParams.toString());
        if (currentPage <= 1) params.delete("page");
        else params.set("page", String(currentPage));
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        sessionStorage.setItem(SCROLL_STORAGE_KEY, "0");
        window.scrollTo(0, 0);
    }, [currentPage, pathname, router, searchParams]);

    const fetchAlbums = async (page: number) => {
        try {
            const response = await fetch(`/api/albums?page=${page - 1}&pageSize=${pageSize}`);
            if (!response.ok) throw new Error('Failed to fetch albums');

            const data = await response.json();
            setAlbums(data.albums);
            setTotalPages(data.pagination.totalPages);
        } catch (error) {
            console.error('[Library] Error fetching albums:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const syncState = useLibrarySync(() => {
        console.log('[Library] Library updated, refreshing albums...');
        fetchAlbums(currentPage);
    });

    useEffect(() => {
        fetchAlbums(currentPage);
    }, [currentPage]);

    const hasRestoredScrollRef = useRef(false);
    useEffect(() => {
        if (isLoading || hasRestoredScrollRef.current) return;
        hasRestoredScrollRef.current = true;
        const saved = sessionStorage.getItem(SCROLL_STORAGE_KEY);
        if (saved) window.scrollTo(0, Number(saved));
    }, [isLoading]);

    useEffect(() => {
        let raf: number | null = null;
        const onScroll = () => {
            if (raf !== null) return;
            raf = requestAnimationFrame(() => {
                sessionStorage.setItem(SCROLL_STORAGE_KEY, String(window.scrollY));
                raf = null;
            });
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            if (raf !== null) cancelAnimationFrame(raf);
        };
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center w-full h-64">
                <p className="text-white/60">Loading library...</p>
            </div>
        );
    }

    if (albums.length === 0) {
        return (
            <div className="flex items-center justify-center w-full h-64">
                <p className="text-white/60">No albums in library</p>
            </div>
        );
    }

    const getPageNumbers = () => {
        const pages = [];
        const maxVisible = 5;
        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);

        if (end - start < maxVisible - 1) {
            start = Math.max(1, end - maxVisible + 1);
        }

        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        return pages;
    };

    return (
        <div className="container mx-auto px-4 py-4">
            {syncState.isReconciling && (
                <div className="mb-4 p-3 bg-white/10 border border-white/20 backdrop-blur-sm rounded-lg">
                    <p className="text-sm text-white">
                        Scanning for new music...
                    </p>
                </div>
            )}

            <div className="w-full mb-4">
                <p className="text-sm text-white/60">
                    {albums.length} albums
                    {syncState.isReconciling && " (updating...)"}
                </p>
            </div>

            <div className="grid w-full gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {albums.map(album => (
                    <AlbumContextMenu key={album.id} album={album}>
                        <AlbumCard album={album} />
                    </AlbumContextMenu>
                ))}
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded-lg bg-white/10 border border-white/20 backdrop-blur-sm hover:bg-white/20 hover:border-white/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        aria-label="Previous page"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>

                    <div className="flex gap-1">
                        {getPageNumbers().map(page => (
                            <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`min-w-9 h-9 px-2 rounded-lg text-sm font-medium transition-all ${
                                    currentPage === page
                                        ? "bg-white/20 text-white border border-white/30"
                                        : "text-white/70 hover:text-white hover:bg-white/10"
                                }`}
                            >
                                {page}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded-lg bg-white/10 border border-white/20 backdrop-blur-sm hover:bg-white/20 hover:border-white/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        aria-label="Next page"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
