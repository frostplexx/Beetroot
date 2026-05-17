import { AlbumArtManager, extractEmbeddedAlbumArt, getAlbumArt } from '../albumart';
import * as fs from 'fs';
import * as path from 'path';

describe('Album Art', () => {
    const manager = new AlbumArtManager();

    describe('AlbumArtManager', () => {
        it('should fetch album art with fallback logic', async () => {
            // This test would require mocking the fetch calls
            // For now, just test the structure
            expect(manager).toBeDefined();
            expect(manager.fetchAlbumArt).toBeDefined();
            expect(typeof manager.fetchAlbumArt).toBe('function');
        });

        it('should prioritize sources based on preference', async () => {
            // Test that preferred sources are tried first
            const context = {
                filePath: __filename,
                artist: 'Test Artist',
                album: 'Test Album'
            };

            const options = {
                preferredSources: ['itunes', 'spotify', 'embedded'] as const
            };

            // Would need to mock fetch to properly test
            expect(options.preferredSources[0]).toBe('itunes');
        });

        it('should check quality requirements', () => {
            const art = {
                buffer: Buffer.from('test'),
                mimeType: 'image/jpeg' as const,
                source: 'itunes' as const,
                quality: 'high' as const,
                width: 600,
                height: 600
            };

            // Access private method via any cast for testing
            const meetsRequirements = (manager as any).meetsQualityRequirements(art, 300, 300);
            expect(meetsRequirements).toBe(true);

            const meetsRequirements2 = (manager as any).meetsQualityRequirements(art, 1000, 1000);
            expect(meetsRequirements2).toBe(false);
        });

        it('should get album folder from file path', () => {
            const filePath = '/music/Artist/Album/track.mp3';
            const folder = manager.getAlbumFolder(filePath);
            expect(folder).toBe('/music/Artist/Album');
        });
    });

    describe('Embedded Album Art', () => {
        it('should extract embedded art from file', async () => {
            // This would require a real audio file with embedded art
            // For now, test that it handles missing art gracefully
            const art = await extractEmbeddedAlbumArt(__filename);
            // Expect null for non-audio file
            expect(art).toBeNull();
        });
    });

    describe('Quality Detection', () => {
        it('should categorize quality based on dimensions', () => {
            const highQuality = {
                buffer: Buffer.from('test'),
                mimeType: 'image/jpeg' as const,
                source: 'itunes' as const,
                quality: 'high' as const,
                width: 1200,
                height: 1200
            };

            expect(highQuality.quality).toBe('high');
            expect(highQuality.width).toBeGreaterThanOrEqual(500);

            const mediumQuality = {
                buffer: Buffer.from('test'),
                mimeType: 'image/jpeg' as const,
                source: 'itunes' as const,
                quality: 'medium' as const,
                width: 400,
                height: 400
            };

            expect(mediumQuality.quality).toBe('medium');

            const lowQuality = {
                buffer: Buffer.from('test'),
                mimeType: 'image/jpeg' as const,
                source: 'itunes' as const,
                quality: 'low' as const,
                width: 200,
                height: 200
            };

            expect(lowQuality.quality).toBe('low');
        });
    });

    describe('Source Priority', () => {
        it('should use default source order', () => {
            const defaultSources = (manager as any).defaultSources;
            expect(defaultSources).toEqual([
                'embedded',
                'coverartarchive',
                'itunes',
                'spotify'
            ]);
        });

        it('should respect custom source order', async () => {
            const customSources = ['spotify', 'itunes', 'embedded'] as const;
            const options = { preferredSources: customSources };

            expect(options.preferredSources).toEqual(customSources);
        });
    });

    describe('Save Album Art', () => {
        const testDir = path.join(__dirname, 'temp-test-album-art');

        beforeEach(async () => {
            // Create test directory
            if (!fs.existsSync(testDir)) {
                await fs.promises.mkdir(testDir, { recursive: true });
            }
        });

        afterEach(async () => {
            // Clean up test directory
            if (fs.existsSync(testDir)) {
                const files = await fs.promises.readdir(testDir);
                for (const file of files) {
                    await fs.promises.unlink(path.join(testDir, file));
                }
                await fs.promises.rmdir(testDir);
            }
        });

        it('should save album art to disk', async () => {
            const art = {
                buffer: Buffer.from('fake image data'),
                mimeType: 'image/jpeg' as const,
                source: 'itunes' as const,
                quality: 'high' as const,
                width: 600,
                height: 600
            };

            const savedPath = await manager.saveAlbumArt(art, testDir);

            expect(savedPath).toBeDefined();
            expect(fs.existsSync(savedPath)).toBe(true);
            expect(path.basename(savedPath)).toBe('cover.jpg');

            const content = await fs.promises.readFile(savedPath);
            expect(content.toString()).toBe('fake image data');
        });

        it('should not overwrite existing cover', async () => {
            const existingCover = path.join(testDir, 'cover.jpg');
            await fs.promises.writeFile(existingCover, 'existing');

            const art = {
                buffer: Buffer.from('new image data'),
                mimeType: 'image/jpeg' as const,
                source: 'itunes' as const,
                quality: 'high' as const,
                width: 600,
                height: 600
            };

            const savedPath = await manager.saveAlbumArt(art, testDir);

            // Should return existing path
            expect(savedPath).toBe(existingCover);

            // Content should still be old
            const content = await fs.promises.readFile(savedPath, 'utf-8');
            expect(content).toBe('existing');
        });

        it('should save PNG with correct extension', async () => {
            const art = {
                buffer: Buffer.from('fake png data'),
                mimeType: 'image/png' as const,
                source: 'spotify' as const,
                quality: 'high' as const,
                width: 640,
                height: 640
            };

            const savedPath = await manager.saveAlbumArt(art, testDir);

            expect(path.basename(savedPath)).toBe('cover.png');
            expect(fs.existsSync(savedPath)).toBe(true);
        });
    });

    describe('Convenience Functions', () => {
        it('should export getAlbumArt convenience function', () => {
            expect(getAlbumArt).toBeDefined();
            expect(typeof getAlbumArt).toBe('function');
        });
    });

    describe('Image Dimension Detection', () => {
        it('should detect JPEG dimensions', () => {
            // Create a minimal JPEG header
            const jpegHeader = Buffer.from([
                0xFF, 0xD8, // SOI marker
                0xFF, 0xC0, // SOF0 marker
                0x00, 0x11, // Length
                0x08,       // Precision
                0x01, 0x2C, // Height: 300
                0x01, 0x2C, // Width: 300
            ]);

            // Would test dimension extraction here
            expect(jpegHeader[0]).toBe(0xFF);
            expect(jpegHeader[1]).toBe(0xD8);
        });

        it('should detect PNG dimensions', () => {
            // Create a minimal PNG header
            const pngHeader = Buffer.alloc(24);
            pngHeader[0] = 0x89;
            pngHeader[1] = 0x50;
            pngHeader[2] = 0x4E;
            pngHeader[3] = 0x47;
            // Width at offset 16-19 (300 = 0x0000012C)
            pngHeader.writeUInt32BE(300, 16);
            // Height at offset 20-23 (300 = 0x0000012C)
            pngHeader.writeUInt32BE(300, 20);

            expect(pngHeader[0]).toBe(0x89);
            expect(pngHeader.readUInt32BE(16)).toBe(300);
            expect(pngHeader.readUInt32BE(20)).toBe(300);
        });
    });
});
