import { BucketConfig, globalConfig } from "../../config";
import * as fs from 'fs';
import { Item } from "../database";
import * as path from 'path';
import NodeID3 from 'node-id3';
import { writeFlacTagsSync } from 'flac-tagger';
import { writeMp4Tags } from './utils/mp4-tagger';

export type WriteBackMode = 'always' | 'never' | 'missing-only';

// == MP3 (ID3v2) Logic ==

function writeTagsMp3(filePath: string, item: Item): boolean {
    const tags: NodeID3.Tags = {
        title: item.title || undefined,
        artist: item.artist || undefined,
        album: item.album || undefined,
        performerInfo: item.albumartist || undefined, // TPE2
        year: item.year ? String(item.year) : undefined,
        trackNumber: item.track ? (item.tracktotal ? `${item.track}/${item.tracktotal}` : String(item.track)) : undefined,
        partOfSet: item.disc ? (item.disctotal ? `${item.disc}/${item.disctotal}` : String(item.disc)) : undefined,
        genre: item.genres?.join('; ') || undefined,
        composer: item.composers || undefined,
        comment: item.comments ? { language: 'eng', text: item.comments } : undefined,
        userDefinedText: [
            { description: 'MUSICBRAINZ_TRACKID', value: item.mb_trackid || '' },
            { description: 'MUSICBRAINZ_ALBUMID', value: item.mb_albumid || '' },
            { description: 'MUSICBRAINZ_ARTISTID', value: item.mb_artistid || '' },
            { description: 'MUSICBRAINZ_ALBUMARTISTID', value: item.mb_albumartistid || '' },
            { description: 'MUSICBRAINZ_RELEASEGROUPID', value: item.mb_releasegroupid || '' },
            { description: 'MUSICBRAINZ_WORKID', value: item.mb_workid || '' },
            { description: 'ISRC', value: item.isrc || '' },
            { description: 'BARCODE', value: item.barcode || '' },
            { description: 'ASIN', value: item.asin || '' },
            { description: 'ACOUSTID_ID', value: item.acoustid_id || '' },
            { description: 'CATALOGNUMBER', value: item.catalognum || '' },
            { description: 'BPM', value: item.bpm ? String(item.bpm) : '' },
            { description: 'INITIAL_KEY', value: item.initial_key || '' },
            { description: 'LANGUAGE', value: item.language || '' },
            { description: 'LABEL', value: item.label || '' },
            { description: 'MEDIA', value: item.media || '' },
            { description: 'LYRICS', value: item.lyrics || '' },
            { description: 'WORK', value: item.work || '' },
        ].filter(t => t.value !== '')
    };

    try {
        const success = NodeID3.write(tags, filePath);
        return success === true;
    } catch (error) {
        console.error(`Error writing MP3 tags to ${filePath}:`, error);
        throw error;
    }
}

// == FLAC (Vorbis Comments) Logic ==

function writeTagsFlac(filePath: string, item: Item): boolean {
    const tags: Record<string, string> = {};
    if (item.title) tags.TITLE = item.title;
    if (item.artist) tags.ARTIST = item.artist;
    if (item.album) tags.ALBUM = item.album;
    if (item.albumartist) tags.ALBUMARTIST = item.albumartist;
    if (item.year) tags.DATE = String(item.year);
    if (item.track) tags.TRACKNUMBER = String(item.track);
    if (item.tracktotal) tags.TRACKTOTAL = String(item.tracktotal);
    if (item.disc) tags.DISCNUMBER = String(item.disc);
    if (item.disctotal) tags.DISCTOTAL = String(item.disctotal);
    if (item.genres && item.genres.length > 0) tags.GENRE = item.genres.join('; ');
    if (item.composers) tags.COMPOSER = item.composers;
    if (item.comments) tags.COMMENT = item.comments;
    if (item.mb_trackid) tags.MUSICBRAINZ_TRACKID = item.mb_trackid;
    if (item.mb_albumid) tags.MUSICBRAINZ_ALBUMID = item.mb_albumid;
    if (item.mb_artistid) tags.MUSICBRAINZ_ARTISTID = item.mb_artistid;
    if (item.mb_albumartistid) tags.MUSICBRAINZ_ALBUMARTISTID = item.mb_albumartistid;
    if (item.mb_releasegroupid) tags.MUSICBRAINZ_RELEASEGROUPID = item.mb_releasegroupid;
    if (item.mb_workid) tags.MUSICBRAINZ_WORKID = item.mb_workid;
    if (item.isrc) tags.ISRC = item.isrc;
    if (item.barcode) tags.BARCODE = item.barcode;
    if (item.asin) tags.ASIN = item.asin;
    if (item.acoustid_id) tags.ACOUSTID_ID = item.acoustid_id;
    if (item.catalognum) tags.CATALOGNUMBER = item.catalognum;
    if (item.bpm) tags.BPM = String(item.bpm);
    if (item.initial_key) tags.INITIAL_KEY = item.initial_key;
    if (item.language) tags.LANGUAGE = item.language;
    if (item.label) tags.LABEL = item.label;
    if (item.media) tags.MEDIA = item.media;
    if (item.lyrics) tags.LYRICS = item.lyrics;
    if (item.work) tags.WORK = item.work;

    try {
        writeFlacTagsSync({ vorbisComments: tags }, filePath);
        return true;
    } catch (error) {
        console.error(`Error writing FLAC tags to ${filePath}:`, error);
        throw error;
    }
}


// == M4A (MP4 Atoms) Logic ==

async function writeTagsM4A(filePath: string, item: Item): Promise<boolean> {
    const tags: any = {
        title: item.title || undefined,
        artist: item.artist || undefined,
        album: item.album || undefined,
        albumArtist: item.albumartist || undefined,
        year: item.year ? String(item.year) : undefined,
        track: item.track || undefined,
        trackTotal: item.tracktotal || undefined,
        disc: item.disc || undefined,
        discTotal: item.disctotal || undefined,
        genre: item.genres?.join('; ') || undefined,
        composer: item.composers || undefined,
        comment: item.comments || undefined,
        lyrics: item.lyrics || undefined,
        custom: {
            'MUSICBRAINZ_TRACKID': item.mb_trackid || '',
            'MUSICBRAINZ_ALBUMID': item.mb_albumid || '',
            'MUSICBRAINZ_ARTISTID': item.mb_artistid || '',
            'MUSICBRAINZ_ALBUMARTISTID': item.mb_albumartistid || '',
            'MUSICBRAINZ_RELEASEGROUPID': item.mb_releasegroupid || '',
            'MUSICBRAINZ_WORKID': item.mb_workid || '',
            'ISRC': item.isrc || '',
            'BARCODE': item.barcode || '',
            'ASIN': item.asin || '',
            'ACOUSTID_ID': item.acoustid_id || '',
            'CATALOGNUMBER': item.catalognum || '',
            'BPM': item.bpm ? String(item.bpm) : '',
            'INITIAL_KEY': item.initial_key || '',
            'LANGUAGE': item.language || '',
            'LABEL': item.label || '',
            'MEDIA': item.media || '',
            'WORK': item.work || '',
        }
    };

    // Remove empty custom tags
    Object.keys(tags.custom).forEach(key => {
        if (tags.custom[key] === '') delete tags.custom[key];
    });

    try {
        writeMp4Tags(filePath, tags);
        return true;
    } catch (error) {
        console.error(`Error writing M4A tags to ${filePath}:`, error);
        throw error;
    }
}


async function writeTags(filePath: string, item: Item): Promise<boolean> {
    const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
    
    if (ext === '.mp3') {
        return writeTagsMp3(filePath, item);
    } else if (ext === '.flac') {
        return writeTagsFlac(filePath, item);
    } else if (ext === '.m4a' || ext === '.mp4') {
        return await writeTagsM4A(filePath, item);
    }
    
    return false;
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
