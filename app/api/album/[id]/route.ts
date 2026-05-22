import { NextRequest, NextResponse } from "next/server"
import { getAlbumById, writeOrUpdateAlbum } from "@/lib/music/database/albums"
import { getItemsByAlbum, batchUpdateItems } from "@/lib/music/database/items"
import { writeBackItem } from "@/lib/music/repository/writeback"
import { globalConfig } from "@/lib/config"
import { revalidatePath } from "next/cache"
import * as path from "path"
import * as fs from "fs/promises"

interface UpdateAlbumPayload {
    album: string
    albumartist: string
    year?: string
    country?: string
    label?: string
    genres?: string
    image?: string
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const albumId = parseInt(id, 10)

        // Validate album ID
        if (!Number.isFinite(albumId) || albumId <= 0) {
            return NextResponse.json({ error: 'Invalid album ID' }, { status: 400 })
        }

        // Get existing album
        const album = getAlbumById(albumId)
        if (!album) {
            return NextResponse.json({ error: 'Album not found' }, { status: 404 })
        }

        // Parse request body
        const payload: UpdateAlbumPayload = await request.json()

        // Validate required fields
        if (!payload.album?.trim() || !payload.albumartist?.trim()) {
            return NextResponse.json(
                { error: 'Album name and artist are required' },
                { status: 400 }
            )
        }

        // Validate year if provided
        if (payload.year) {
            const year = parseInt(payload.year, 10)
            if (!Number.isFinite(year) || year < 1000 || year > new Date().getFullYear() + 10) {
                return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
            }
        }

        // Update album fields
        album.album = payload.album.trim()
        album.albumartist = payload.albumartist.trim()
        album.year = payload.year ? parseInt(payload.year, 10) : null
        album.country = payload.country?.trim() || null
        album.label = payload.label?.trim() || null
        album.genres = payload.genres?.trim() || null

        // Handle cover art if provided and is external URL
        if (payload.image && payload.image.startsWith('http')) {
            try {
                // Download image
                const response = await fetch(payload.image)
                if (!response.ok) {
                    throw new Error(`Failed to download image: ${response.status}`)
                }

                // Validate content type
                const contentType = response.headers.get('content-type')
                if (!contentType?.startsWith('image/')) {
                    throw new Error('URL does not point to an image')
                }

                const arrayBuffer = await response.arrayBuffer()
                const imageBuffer = Buffer.from(arrayBuffer)

                // Check size limit (10MB)
                if (imageBuffer.length > 10 * 1024 * 1024) {
                    throw new Error('Image too large (max 10MB)')
                }

                // Get album directory from first track
                const items = getItemsByAlbum(albumId)
                if (items.length === 0) {
                    throw new Error('No tracks found for album')
                }

                const albumDir = path.dirname(items[0].path)
                const coverPath = path.join(albumDir, 'cover.jpg')

                // Save to filesystem
                await fs.writeFile(coverPath, imageBuffer)

                // Update album artpath
                album.artpath = coverPath
                console.log(`Cover art saved to ${coverPath}`)

            } catch (error) {
                console.error('Error downloading cover art:', error)
                // Continue with metadata update even if cover art fails
            }
        }

        // Save album to database
        writeOrUpdateAlbum(album)

        // Propagate changes to all tracks
        const items = getItemsByAlbum(albumId)

        if (items.length > 0) {
            // Batch update items in database
            const updates = items.map(item => ({
                id: item.id,
                fields: {
                    album: album.album,
                    albumartist: album.albumartist,
                    year: album.year,
                    country: album.country,
                    label: album.label,
                    genres: album.genres,
                }
            }))

            batchUpdateItems(updates)

            // Write back to audio files
            const writebackMode = globalConfig.writeback_mode || 'missing-only'
            let successCount = 0
            let errorCount = 0

            for (const item of items) {
                // Update item object with new values
                item.album = album.album
                item.albumartist = album.albumartist
                item.year = album.year
                item.country = album.country
                item.label = album.label

                // Parse genres string to array
                if (album.genres) {
                    item.genres = album.genres.split(',').map(g => g.trim())
                } else {
                    item.genres = null
                }

                try {
                    writeBackItem(item, writebackMode)
                    successCount++
                } catch (error) {
                    console.error(`Failed to write back to ${item.path}:`, error)
                    errorCount++
                    // Continue with other tracks
                }
            }

            console.log(`Writeback complete: ${successCount} succeeded, ${errorCount} failed`)
        }

        // Revalidate cache
        revalidatePath(`/album/${albumId}`)
        revalidatePath('/')

        return NextResponse.json({
            success: true,
            albumId,
            tracksUpdated: items.length
        })

    } catch (error) {
        console.error('Error updating album:', error)
        return NextResponse.json(
            {
                error: 'Failed to update album',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        )
    }
}
