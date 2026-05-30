import { createFileRoute } from "@tanstack/react-router";
import { getAlbumById } from "@/lib/music/database/albums";
import { getItemsByAlbum } from "@/lib/music/database/items";
import {
    lookupReleaseForCluster,
    searchReleasesByArtistAlbum,
    MusicBrainzRelease,
} from "@/lib/music/repository/sources/musicbrainz/musicbrainz";

interface MusicBrainzTrack {
    position: number;
    title: string;
    artist: string;
    composer?: string;
    length: number;
    isrc?: string;
}

interface MusicBrainzReleaseResponse {
    id: string;
    title: string;
    artist: string;
    date: string;
    country: string;
    label: string;
    catalog?: string;
    barcode?: string;
    status?: string;
    packaging?: string;
    score?: number;
    tracks?: MusicBrainzTrack[];
    trackCount?: number;
}

function formatMusicBrainzRelease(
    release: MusicBrainzRelease,
    score: number,
): MusicBrainzReleaseResponse {
    const artistCredit = release["artist-credit"]?.[0];
    const labelInfo = release["label-info"]?.[0];

    const tracks: MusicBrainzTrack[] = [];
    if (release.media) {
        for (const medium of release.media) {
            if (medium.tracks) {
                for (const track of medium.tracks) {
                    tracks.push({
                        position: track.position,
                        title: track.title,
                        artist: artistCredit?.artist.name || "",
                        length: 0,
                    });
                }
            }
        }
    }

    const totalTracks = release.media?.reduce((sum, m) => sum + (m["track-count"] || 0), 0) || 0;

    return {
        id: release.id,
        title: release.title,
        artist: artistCredit?.artist.name || "",
        date: release.date || "",
        country: release.country || "",
        label: labelInfo?.label?.name || "",
        catalog: labelInfo?.["catalog-number"],
        barcode: release.barcode || "",
        status: release.status || "",
        score,
        tracks,
        trackCount: totalTracks,
    };
}

export const Route = createFileRoute("/api/album/$id/musicbrainz")({
    server: {
        handlers: {
            GET: async ({ request, params }) => {
                try {
                    const albumId = parseInt(params.id, 10);
                    if (!Number.isFinite(albumId) || albumId <= 0) {
                        return Response.json({ error: "Invalid album ID" }, { status: 400 });
                    }
                    const album = getAlbumById(albumId);
                    if (!album) {
                        return Response.json({ error: "Album not found" }, { status: 404 });
                    }
                    const items = getItemsByAlbum(albumId);
                    if (items.length === 0) {
                        return Response.json(
                            { error: "No tracks found for album" },
                            { status: 404 },
                        );
                    }

                    const { searchParams } = new URL(request.url);
                    const query = searchParams.get("q");
                    const artistOverride = searchParams.get("artist");

                    if (query) {
                        const artist = artistOverride ?? album.albumartist ?? "";
                        const searchResults = await searchReleasesByArtistAlbum(
                            artist,
                            query,
                            10,
                            1, // user-facing: skip ahead of background reconciliation
                        );
                        if (searchResults.length === 0) {
                            return Response.json({
                                releases: [],
                                message: "No matching releases found in MusicBrainz",
                            });
                        }
                        const formattedReleases = searchResults.map((release) =>
                            formatMusicBrainzRelease(release, release.score || 0),
                        );
                        return Response.json({
                            releases: formattedReleases,
                            selectedRelease: formattedReleases[0],
                        });
                    }

                    const result = await lookupReleaseForCluster(
                        {
                            albumartist: album.albumartist,
                            album: album.album,
                            trackCount: items.length,
                            releaseGroupId: album.mb_releasegroupid,
                        },
                        1, // user-facing: skip ahead of background reconciliation
                    );

                    if (!result) {
                        return Response.json({
                            releases: [],
                            message: "No matching releases found in MusicBrainz",
                        });
                    }
                    const formattedRelease = formatMusicBrainzRelease(result.release, 100);
                    return Response.json({
                        releases: [formattedRelease],
                        selectedRelease: formattedRelease,
                    });
                } catch (error) {
                    console.error("Error searching MusicBrainz:", error);
                    return Response.json(
                        {
                            error: "Failed to search MusicBrainz",
                            details: error instanceof Error ? error.message : "Unknown error",
                        },
                        { status: 500 },
                    );
                }
            },
        },
    },
});
