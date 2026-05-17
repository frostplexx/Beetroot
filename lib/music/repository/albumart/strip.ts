import * as flac from 'flac-metadata';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Strips embedded album art from a FLAC file
 * @param filePath Path to FLAC file
 * @returns true if pictures were removed, false if none found or not FLAC
 */
export async function stripEmbeddedAlbumArt(filePath: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        try {
            // Only process FLAC files
            if (!filePath.toLowerCase().endsWith('.flac')) {
                console.log(`    ⊘ Not a FLAC file, skipping art strip`);
                resolve(false);
                return;
            }

            console.log(`    → Stripping embedded album art from FLAC...`);

            const tempPath = filePath + '.tmp';
            let hadPictures = false;

            const reader = fs.createReadStream(filePath);
            const writer = fs.createWriteStream(tempPath);
            const processor = new flac.Processor({ parseMetaDataBlocks: true });

            processor.on('preprocess', (mdb: any) => {
                // Remove all picture blocks
                if (mdb.type === flac.Processor.MDB_TYPE_PICTURE) {
                    hadPictures = true;
                    console.log(`    → Removing embedded picture`);
                    mdb.remove();
                }
            });

            processor.on('error', (err: Error) => {
                console.warn(`    ⚠ Error processing FLAC:`, err);
                reject(err);
            });

            writer.on('finish', () => {
                if (hadPictures) {
                    // Replace original with temp file
                    fs.renameSync(tempPath, filePath);
                    console.log(`    ✓ Embedded album art stripped from FLAC`);
                    resolve(true);
                } else {
                    // No pictures found, remove temp file
                    fs.unlinkSync(tempPath);
                    console.log(`    ℹ No embedded pictures found`);
                    resolve(false);
                }
            });

            writer.on('error', (err: Error) => {
                console.warn(`    ⚠ Error writing FLAC:`, err);
                // Clean up temp file
                try {
                    fs.unlinkSync(tempPath);
                } catch {}
                reject(err);
            });

            reader.pipe(processor).pipe(writer);
        } catch (error) {
            console.warn(`    ⚠ Failed to strip embedded album art:`, error);
            reject(error);
        }
    });
}
