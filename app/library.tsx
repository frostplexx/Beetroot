"use client";

import { useEffect, useState } from "react";
import AlbumCard from "@/components/album_card";
import { Album } from "@/lib/music/database/albums";
import { useLibrarySync } from "@/hooks/use-library-sync";

export default function Library() {
    const [albums, setAlbums] = useState<Album[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch albums from API
    const fetchAlbums = async () => {
        try {
            const response = await fetch('/api/albums?page=0&pageSize=30');
            if (!response.ok) throw new Error('Failed to fetch albums');

            const data = await response.json();
            setAlbums(data.albums);
        } catch (error) {
            console.error('[Library] Error fetching albums:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Subscribe to library changes and refresh when reconciliation completes
    const syncState = useLibrarySync(() => {
        console.log('[Library] Library updated, refreshing albums...');
        fetchAlbums();
    });

    // Debug: log sync state changes
    useEffect(() => {
        console.log('[Library] Sync state:', {
            isConnected: syncState.isConnected,
            isReconciling: syncState.isReconciling,
            lastUpdate: syncState.lastUpdate
        });
    }, [syncState]);

    // Initial fetch
    useEffect(() => {
        fetchAlbums();
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center w-full h-64">
                <p className="text-muted-foreground">Loading library...</p>
            </div>
        );
    }

    if (albums.length === 0) {
        return (
            <div className="flex items-center justify-center w-full h-64">
                <p className="text-muted-foreground">No albums in library</p>
            </div>
        );
    }

    return (
        <>
            {syncState.isReconciling && (
                <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                        Scanning for new music...
                    </p>
                </div>
            )}
            <div className="grid w-full gap-4 grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]">
                {albums.map(album => (
                    <AlbumCard key={album.id} album={album} />
                ))}
            </div>
        </>
    );
}
