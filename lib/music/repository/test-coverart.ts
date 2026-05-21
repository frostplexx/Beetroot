import { getAlbumsWithMissingArtwork, getAlbumById, getAllAlbums } from "../database";
import { handleCoverArt } from "./coverart";

/**
 * Test cover art fetching
 * Usage:
 *   npm run test:coverart              # Test first album with missing artwork
 *   npm run test:coverart <album_id>   # Test specific album by ID
 *   npm run test:coverart all          # Test all albums with missing artwork (up to 10)
 */

async function testCoverArt() {
    const args = process.argv.slice(2);
    const arg = args[0];

    console.log('🎨 Testing Cover Art Fetching\n');

    if (arg === 'all') {
        // Test all albums with missing artwork (limit to 10)
        const albums = getAlbumsWithMissingArtwork().slice(0, 10);

        if (albums.length === 0) {
            console.log('✨ No albums with missing artwork found!');
            return;
        }

        console.log(`Found ${albums.length} albums with missing artwork. Testing...\n`);

        for (const album of albums) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`Album: ${album.albumartist} - ${album.album}`);
            console.log(`Album ID: ${album.id}`);
            console.log(`MusicBrainz ID: ${album.mb_albumid || 'N/A'}`);
            console.log(`Discogs ID: ${album.discogs_albumid || 'N/A'}`);
            console.log(${'='.repeat(60)}\n`);

            try {
                const success = await handleCoverArt(album);
                if (success && album.artpath) {
                    console.log(`✅ Success! Cover art saved to: ${album.artpath}\n`);
                } else {
                    console.log(`❌ Failed to fetch cover art\n`);
                }
            } catch (error) {
                console.error(`❌ Error: ${error}\n`);
            }

            // Small delay between requests to be nice to APIs
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

    } else if (arg) {
        // Test specific album by ID
        const albumId = parseInt(arg);
        if (isNaN(albumId)) {
            console.error('❌ Invalid album ID. Must be a number.');
            process.exit(1);
        }

        const album = getAlbumById(albumId);
        if (!album) {
            console.error(`❌ Album with ID ${albumId} not found.`);
            process.exit(1);
        }

        console.log(`Album: ${album.albumartist} - ${album.album}`);
        console.log(`Album ID: ${album.id}`);
        console.log(`Current artpath: ${album.artpath || 'none'}`);
        console.log(`MusicBrainz ID: ${album.mb_albumid || 'N/A'}`);
        console.log(`Discogs ID: ${album.discogs_albumid || 'N/A'}`);
        console.log(`\nFetching cover art...\n`);

        try {
            const success = await handleCoverArt(album);
            if (success && album.artpath) {
                console.log(`\n✅ Success! Cover art saved to: ${album.artpath}`);
            } else {
                console.log(`\n❌ Failed to fetch cover art`);
            }
        } catch (error) {
            console.error(`\n❌ Error: ${error}`);
            process.exit(1);
        }

    } else {
        // Test first album with missing artwork
        const albums = getAlbumsWithMissingArtwork();

        if (albums.length === 0) {
            console.log('✨ No albums with missing artwork found!');
            console.log('\n💡 Try testing a specific album:');
            console.log('   npm run test:coverart <album_id>');

            // Show some albums
            const allAlbums = getAllAlbums().slice(0, 5);
            if (allAlbums.length > 0) {
                console.log('\n📀 Available albums:');
                allAlbums.forEach(album => {
                    console.log(`   ID ${album.id}: ${album.albumartist} - ${album.album}`);
                });
            }
            return;
        }

        const album = albums[0];

        console.log(`Testing first album with missing artwork:`);
        console.log(`Album: ${album.albumartist} - ${album.album}`);
        console.log(`Album ID: ${album.id}`);
        console.log(`MusicBrainz ID: ${album.mb_albumid || 'N/A'}`);
        console.log(`Discogs ID: ${album.discogs_albumid || 'N/A'}`);
        console.log(`\nFetching cover art...\n`);

        try {
            const success = await handleCoverArt(album);
            if (success && album.artpath) {
                console.log(`\n✅ Success! Cover art saved to: ${album.artpath}`);
                console.log(`\n💡 Found ${albums.length - 1} more albums with missing artwork.`);
                console.log('   Run "npm run test:coverart all" to test them all.');
            } else {
                console.log(`\n❌ Failed to fetch cover art`);
            }
        } catch (error) {
            console.error(`\n❌ Error: ${error}`);
            process.exit(1);
        }
    }
}

testCoverArt().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
