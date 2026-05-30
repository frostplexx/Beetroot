import { createFileRoute } from "@tanstack/react-router";
import { getAlbumById } from "@/lib/music/database/albums";
import { globalConfig } from "@/lib/config";

interface AlternativeArtwork {
    source: string;
    url: string;
    thumbnail?: string;
}

async function fetchFromItunes(artist: string, album: string): Promise<AlternativeArtwork[]> {
    try {
        const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}+${encodeURIComponent(album)}&entity=album&limit=10`;
        const response = await fetch(searchUrl);
        if (!response.ok) return [];
        const data = await response.json();
        if (data.results && data.results.length > 0) {
            return data.results
                .filter((result: any) => result.artworkUrl100)
                .map((result: any) => ({
                    source: "iTunes",
                    url: result.artworkUrl100.replace("100x100", "600x600"),
                    thumbnail: result.artworkUrl100.replace("100x100", "200x200"),
                }));
        }
        return [];
    } catch (error) {
        console.error("iTunes API error:", error);
        return [];
    }
}

async function fetchFromLastfm(artist: string, album: string): Promise<AlternativeArtwork[]> {
    try {
        if (!globalConfig.lastfm_api_key) return [];
        const apiUrl = `https://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=${globalConfig.lastfm_api_key}&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}&format=json`;
        const response = await fetch(apiUrl);
        if (!response.ok) return [];
        const data = await response.json();
        if (data.album && data.album.image) {
            const largestImage = data.album.image[data.album.image.length - 1];
            if (largestImage && largestImage["#text"]) {
                return [
                    {
                        source: "Last.fm",
                        url: largestImage["#text"],
                        thumbnail: data.album.image.find((img: any) => img.size === "medium")?.["#text"],
                    },
                ];
            }
        }
        return [];
    } catch (error) {
        console.error("Last.fm API error:", error);
        return [];
    }
}

async function fetchFromDiscogs(
    artist: string,
    album: string,
    discogsAlbumId?: string,
): Promise<AlternativeArtwork[]> {
    try {
        const headers: Record<string, string> = { "User-Agent": "Beetroot/0.1.0" };
        if (globalConfig.discogs_token) {
            headers["Authorization"] = `Discogs token=${globalConfig.discogs_token}`;
        }
        const searchUrl = discogsAlbumId
            ? `https://api.discogs.com/releases/${discogsAlbumId}`
            : `https://api.discogs.com/database/search?artist=${encodeURIComponent(artist)}&release_title=${encodeURIComponent(album)}&type=release&per_page=10`;
        const response = await fetch(searchUrl, { headers });
        if (!response.ok) return [];
        const data = await response.json();
        if (discogsAlbumId && data.images) {
            return data.images.map((img: any) => ({
                source: "Discogs",
                url: img.uri,
                thumbnail: img.uri150,
            }));
        } else if (data.results) {
            return data.results
                .filter((result: any) => result.cover_image && result.cover_image !== "")
                .map((result: any) => ({
                    source: "Discogs",
                    url: result.cover_image,
                    thumbnail: result.thumb,
                }));
        }
        return [];
    } catch (error) {
        console.error("Discogs API error:", error);
        return [];
    }
}

export const Route = createFileRoute("/api/album/$id/alternatives")({
    server: {
        handlers: {
            GET: async ({ params }) => {
                try {
                    const albumId = parseInt(params.id, 10);
                    if (!Number.isFinite(albumId) || albumId <= 0) {
                        return Response.json({ error: "Invalid album ID" }, { status: 400 });
                    }
                    const album = getAlbumById(albumId);
                    if (!album) {
                        return Response.json({ error: "Album not found" }, { status: 404 });
                    }

                    const [itunesResults, lastfmResults, discogsResults] = await Promise.all([
                        fetchFromItunes(album.albumartist || "", album.album || ""),
                        fetchFromLastfm(album.albumartist || "", album.album || ""),
                        fetchFromDiscogs(
                            album.albumartist || "",
                            album.album || "",
                            album.discogs_albumid?.toString() || undefined,
                        ),
                    ]);

                    const allResults = [...itunesResults, ...lastfmResults, ...discogsResults];
                    const uniqueResults = Array.from(
                        new Map(allResults.map((item) => [item.url, item])).values(),
                    );

                    return Response.json({
                        alternatives: uniqueResults,
                        count: uniqueResults.length,
                    });
                } catch (error) {
                    console.error("Error fetching alternative artworks:", error);
                    return Response.json(
                        { error: "Failed to fetch alternative artworks" },
                        { status: 500 },
                    );
                }
            },
        },
    },
});
