import { BucketConfig, globalConfig } from "../../config";
import * as fs from 'fs';
import { Item } from "../database";
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export type WriteBackMode = 'always' | 'never' | 'missing-only';

// Use system ffmpeg - assumes ffmpeg is installed and in PATH
const FFMPEG_BIN = 'ffmpeg';



// == Write back logic

// Mapping configuration: Item field -> ffmpeg metadata key or transform function
type MetadataMapping = {
    [K in keyof Partial<Item>]: string | ((item: Item) => string | null);
};

const METADATA_MAPPING: MetadataMapping = {
    // Basic metadata
    title: 'title',
    artist: 'artist',
    album: 'album',
    albumartist: 'album_artist',
    year: 'date',

    // Track/disc info (handled specially)
    track: (item) => {
        if (item.track === null || item.track === undefined) return null;
        if (item.tracktotal !== null && item.tracktotal !== undefined) {
            return `${item.track}/${item.tracktotal}`;
        }
        return String(item.track);
    },
    disc: (item) => {
        if (item.disc === null || item.disc === undefined) return null;
        if (item.disctotal !== null && item.disctotal !== undefined) {
            return `${item.disc}/${item.disctotal}`;
        }
        return String(item.disc);
    },

    // Additional metadata
    genres: (item) => item.genres?.join('; ') || null,
    composers: 'composer',
    comments: 'comment',
    grouping: 'grouping',
    subtitle: 'subtitle',

    // MusicBrainz IDs
    mb_trackid: 'musicbrainz_trackid',
    mb_albumid: 'musicbrainz_albumid',
    mb_artistid: 'musicbrainz_artistid',
    mb_albumartistid: 'musicbrainz_albumartistid',
    mb_releasegroupid: 'musicbrainz_releasegroupid',
    mb_workid: 'musicbrainz_workid',

    // Other identifiers
    isrc: 'isrc',
    barcode: 'barcode',
    asin: 'asin',
    acoustid_id: 'acoustid_id',
    catalognum: 'catalog_number',

    // Additional fields
    bpm: 'bpm',
    initial_key: 'initial_key',
    language: 'language',
    label: 'label',
    media: 'media',
    lyrics: 'lyrics',
    work: 'work',
};

function buildMetadataArgs(item: Item): string[] {
    const args: string[] = [];

    // Helper to add metadata if value exists
    const addMeta = (key: string, value: any) => {
        if (value !== null && value !== undefined && value !== '') {
            // Convert value to string and ensure it doesn't contain 'undefined'
            const strValue = String(value);
            if (!strValue.includes('undefined')) {
                args.push('-metadata', `${key}=${strValue}`);
            }
        }
    };

    // Process each mapping entry
    for (const [itemKey, ffmpegKeyOrFn] of Object.entries(METADATA_MAPPING)) {
        const itemValue = item[itemKey as keyof Item];

        if (typeof ffmpegKeyOrFn === 'function') {
            // Transform function
            const result = ffmpegKeyOrFn(item);
            if (result !== null && result !== undefined) {
                // Extract the metadata key from the function (use itemKey as fallback)
                addMeta(itemKey, result);
            }
        } else {
            // Direct mapping - only add if value exists
            if (itemValue !== null && itemValue !== undefined) {
                addMeta(ffmpegKeyOrFn, itemValue);
            }
        }
    }

    return args;
}

async function writeTags(filePath: string, item: Item): Promise<boolean> {
    // Use same extension as original file so ffmpeg can detect format
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    const tempPath = filePath + '.writing' + ext;
    const metadataArgs = buildMetadataArgs(item);

    try {
        // Build ffmpeg command: input file -> copy streams -> add metadata -> output
        const args = [
            '-i', filePath,           // Input file
            '-c', 'copy',             // Copy all streams without re-encoding
            '-map_metadata', '0',     // Copy existing metadata first
            ...metadataArgs,          // Add/override with new metadata
            '-y',                     // Overwrite output file
            tempPath                  // Output to temp file
        ];

        await execFileAsync(FFMPEG_BIN, args, {
            maxBuffer: 10 * 1024 * 1024,
            timeout: 60_000,  // 60s timeout for metadata-only rewrite
            killSignal: 'SIGKILL'
        });

        // Replace original file with temp file
        fs.renameSync(tempPath, filePath);
        return true;
    } catch (error) {
        console.error(`Error writing tags to ${filePath}:`, error);
        // Clean up temp file if it exists
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
        throw error; // Throw to abort import
    }
}

function shouldWriteBack(mode: WriteBackMode, item: Item): boolean {
    switch (mode) {
        case 'always':
            return true;
        case 'never':
            return false;
        case 'missing-only':
            // Note: Current implementation treats 'missing-only' as 'always' because
            // checking if ANY field is null returns true for almost every item.
            // TODO: Implement proper comparison with file tags to only write missing fields
            // For now, document this honestly and default to 'always' behavior
            return true;
        default:
            throw new Error(`Invalid write back mode: ${mode}`);
    }
}



// Returns true if writeback was successful
// Note: Cover art is handled at the album level, not per-item
// Throws error on critical failures
export async function writeBackItem(item: Item, mode: WriteBackMode): Promise<void> {
    if (!shouldWriteBack(mode, item)) {
        return;
    }

    // Write tags to file (will throw on error)
    await writeTags(item.path, item);
}


// == File moving logic

/**
 * Compute the target path for an item based on the path template in config.
 * This is a pure function with no side effects - it only computes the path.
 *
 * @param item The item to compute the path for
 * @returns The canonical path where the item should be located
 */
export function computeTargetPath(item: Item): string {
    // Extract file extension (e.g. "mp3") for later reattachment
    const ext = item.path.split('.').pop()!;

    // Parse the path template from config, evaluate it with item metadata, and reattach file extension at the end
    const nodes = parse((lex(globalConfig.path)))

    const clean_music_path = (globalConfig.music_directory.endsWith('/') ? globalConfig.music_directory : globalConfig.music_directory + '/')
        .replace("~", process.env.HOME || '')  // ensure music_directory ends with '/' and expand ~ to home dir;

    // vars available to path template: $albumartist, $album, $track, $title (extend as needed)
    const result = clean_music_path + evaluate(nodes, {
        albumartist: item.albumartist || 'Unknown Artist',
        album: item.album || 'Unknown Album',
        track: item.track ? String(item.track).padStart(2, '0') : '',
        title: item.title || 'Unknown Title',
    }, globalConfig.bucket)
        .replace(/\/\s+/g, '/') // Remove leading spaces after slashes
        .replace(/\s+\./g, '.') // Remove spaces before extensions
        .concat('.' + ext);  // add file extension back on;

    return result;
}

export function moveItem(item: Item): boolean {
    const targetPath = computeTargetPath(item);

    // Only move file if the evaluated path is different from current path
    const shouldMove = item.path !== targetPath;

    if (shouldMove && moveFile(item.path, targetPath)) {
        item.path = targetPath;  // Update item path after successful move
        return true;
    }
    return false;
}


export function moveFile(oldPath: string, newPath: string): boolean {

    // Recursively  create folders if they don't exist
    const dir = newPath.substring(0, newPath.lastIndexOf('/'));
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
            recursive: true
        });
    }

    try {
        fs.renameSync(oldPath, newPath);
    }
    catch (error) {
        console.error(`Error moving file from ${oldPath} to ${newPath}:`, error);
        return false;
    }

    return true
}



// == DSL Grammar definitions

type TT = 'PERCENT' | 'DOLLAR' | 'IDENT' | 'LBRACE' | 'RBRACE' | 'COMMA' | 'LITERAL' | 'EOF';
type Token = { type: TT; value?: string };


function lex(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    while (i < input.length) {
        const ch = input[i];
        if (ch === '%') { tokens.push({ type: 'PERCENT' }); i++; }
        else if (ch === '$') { tokens.push({ type: 'DOLLAR' }); i++; }
        else if (ch === '{') { tokens.push({ type: 'LBRACE' }); i++; }
        else if (ch === '}') { tokens.push({ type: 'RBRACE' }); i++; }
        else if (ch === ',') { tokens.push({ type: 'COMMA' }); i++; }
        else if (/[a-z0-9_]/i.test(ch)) {
            let s = '';
            while (i < input.length && /[a-z0-9_]/i.test(input[i])) s += input[i++];
            tokens.push({ type: 'IDENT', value: s });
        } else {
            // everything else (/, spaces, dots) → LITERAL
            let s = '';
            while (i < input.length && !/[%${},a-z0-9_]/i.test(input[i])) s += input[i++];
            if (s) tokens.push({ type: 'LITERAL', value: s });
        }
    }

    tokens.push({ type: 'EOF' });
    return tokens;
}

type PathNode =
    | { type: 'Literal'; value: string }
    | { type: 'Var'; name: string }
    | { type: 'FuncCall'; name: string; args: string[] };  // args are ident/literal strings


function parse(tokens: Token[]): PathNode[] {
    let i = 0;
    const peek = () => tokens[i];
    const eat = (t: TT) => {
        if (peek().type !== t) throw new Error(`Expected ${t}, got ${peek().type}`);
        return tokens[i++];
    };

    const nodes: PathNode[] = [];

    while (peek().type !== 'EOF') {
        const tok = peek();

        if (tok.type === 'PERCENT') {
            // %funcname{arg1,arg2,...}
            eat('PERCENT');
            const name = eat('IDENT').value!;
            eat('LBRACE');
            const args: string[] = [];
            while (peek().type !== 'RBRACE') {
                if (peek().type === 'COMMA') { eat('COMMA'); continue; }
                if (peek().type === 'DOLLAR') {
                    eat('DOLLAR');
                    args.push(eat('IDENT').value!);  // store bare name, caller knows it's a var
                } else {
                    args.push(eat('IDENT').value!);  // bare ident = literal arg (e.g. 'alpha')
                }
            }
            eat('RBRACE');
            nodes.push({ type: 'FuncCall', name, args });

        } else if (tok.type === 'DOLLAR') {
            // $varname
            eat('DOLLAR');
            const name = eat('IDENT').value!;
            nodes.push({ type: 'Var', name });

        } else if (tok.type === 'IDENT' || tok.type === 'LITERAL') {
            nodes.push({ type: 'Literal', value: tok.value! });
            i++;

        } else {
            // treat stray structural chars as literals (e.g. '/')
            nodes.push({ type: 'Literal', value: tok.type });
            i++;
        }
    }

    return nodes;
}

function evaluate(
    nodes: PathNode[],
    vars: Record<string, string>,
    buckets: BucketConfig
): string {
    return nodes.map(node => {
        switch (node.type) {
            case 'Literal':
                return node.value;

            case 'Var':
                if (!(node.name in vars)) throw new Error(`Undefined var: $${node.name}`);
                return vars[node.name];

            case 'FuncCall':
                return callFunc(node.name, node.args, vars, buckets);
        }
    }).join('');
}

function callFunc(
    name: string,
    args: string[],
    vars: Record<string, string>,
    buckets: BucketConfig
): string {
    switch (name) {
        case 'bucket': {
            const [varName, bucketName] = args;
            if (!(bucketName in buckets)) throw new Error(`Invalid bucket: ${bucketName}`);
            const value = vars[varName];
            if (!value) {
                // Return fallback bucket (last one) if value is empty
                const bucketArray = buckets[bucketName as keyof BucketConfig];
                return bucketArray[bucketArray.length - 1];
            }
            return resolveBucket(value, buckets[bucketName as keyof BucketConfig]);
        }
        default:
            throw new Error(`Unknown function: %${name}`);
    }
}


function resolveBucket(value: string, ranges: string[]): string {
    const first = value[0].toUpperCase();
    for (const range of ranges) {
        // handles "A-F" style ranges
        const match = range.match(/^([A-Z])-([A-Z])$/);
        if (match) {
            if (first >= match[1] && first <= match[2]) return range;
        } else {
            // non-range bucket (e.g. year buckets — extend as needed)
            if (value.startsWith(range)) return range;
        }
    }
    return ranges[ranges.length - 1]; // fallback: last bucket
}
