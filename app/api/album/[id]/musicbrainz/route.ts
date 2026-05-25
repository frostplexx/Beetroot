import { NextRequest, NextResponse } from "next/server"
import { getAlbumById } from "@/lib/music/database/albums"
import { getItemsByAlbum } from "@/lib/music/database/items"
import {
    lookupReleaseForCluster,
    searchReleasesByArtistAlbum,
    MusicBrainzRelease
} from "@/lib/music/repository/sources/musicbrainz/musicbrainz"

interface MusicBrainzTrack {
    position: number
    title: string
    artist: string
    composer?: string
    length: number
    isrc?: string
}

interface MusicBrainzReleaseResponse {
    id: string
    title: string
    artist: string
    date: string
    country: string
    label: string
    catalog?: string
    barcode?: string
    status?: string
    packaging?: string
    score?: number
    tracks?: MusicBrainzTrack[]
    trackCount?: number
}

function formatMusicBrainzRelease(release: MusicBrainzRelease, score: number): MusicBrainzReleaseResponse {
    const artistCredit = release['artist-credit']?.[0]
    const labelInfo = release['label-info']?.[0]

    // Extract basic track info from media
    const tracks: MusicBrainzTrack[] = []
    if (release.media) {
        for (const medium of release.media) {
            if (medium.tracks) {
                for (const track of medium.tracks) {
                    tracks.push({
                        position: track.position,
                        title: track.title,
                        artist: artistCredit?.artist.name || '',
                        length: 0, // Length not available in basic release response
                    })
                }
            }
        }
    }

    const totalTracks = release.media?.reduce((sum, m) => sum + (m['track-count'] || 0), 0) || 0

    return {
        id: release.id,
        title: release.title,
        artist: artistCredit?.artist.name || '',
        date: release.date || '',
        country: release.country || '',
        label: labelInfo?.label?.name || '',
        catalog: labelInfo?.['catalog-number'],
        barcode: release.barcode || '',
        status: release.status || '',
        score,
        tracks,
        trackCount: totalTracks,
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const albumId = parseInt(id, 10)

        if (!Number.isFinite(albumId) || albumId <= 0) {
            return NextResponse.json({ error: 'Invalid album ID' }, { status: 400 })
        }

        const album = getAlbumById(albumId)
        if (!album) {
            return NextResponse.json({ error: 'Album not found' }, { status: 404 })
        }

        const items = getItemsByAlbum(albumId)
        if (items.length === 0) {
            return NextResponse.json({ error: 'No tracks found for album' }, { status: 404 })
        }

        // Check if a custom search query was provided
        const { searchParams } = new URL(request.url)
        const query = searchParams.get('q')

        if (query) {
            // Use text-based search with the provided query
            const searchResults = await searchReleasesByArtistAlbum(
                album.albumartist || '',
                query,
                10
            )

            if (searchResults.length === 0) {
                return NextResponse.json({
                    releases: [],
                    message: 'No matching releases found in MusicBrainz'
                })
            }

            // Format all search results
            const formattedReleases = searchResults.map(release =>
                formatMusicBrainzRelease(release, release.score || 0)
            )

            return NextResponse.json({
                releases: formattedReleases,
                selectedRelease: formattedReleases[0]
            })
        } else {
            // Use cluster-based lookup for best match
            const result = await lookupReleaseForCluster({
                albumartist: album.albumartist,
                album: album.album,
                trackCount: items.length,
                releaseGroupId: album.mb_releasegroupid,
            })

            if (!result) {
                return NextResponse.json({
                    releases: [],
                    message: 'No matching releases found in MusicBrainz'
                })
            }

            // Format the release for the UI
            const formattedRelease = formatMusicBrainzRelease(result.release, 100)

            return NextResponse.json({
                releases: [formattedRelease],
                selectedRelease: formattedRelease
            })
        }

    } catch (error) {
        console.error('Error searching MusicBrainz:', error)
        return NextResponse.json(
            {
                error: 'Failed to search MusicBrainz',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        )
    }
}
