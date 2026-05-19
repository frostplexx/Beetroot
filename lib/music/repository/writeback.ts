import { BucketConfig, globalConfig } from "../../config";
import * as fs from 'fs';
import { Item } from "../database";
import { handleCoverArt } from "./coverart";

export type WriteBackMode = 'always' | 'never' | 'missing-only';



// == Write back logic


function shouldWriteBack(mode: WriteBackMode, item: Item): boolean {
    switch (mode) {
        case 'always':
            return true;
        case 'never':
            return false;
        case 'missing-only':
            // Only write back if there are missing fields
            return Object.values(item).some(value => value === null || value === undefined);
        default:
            throw new Error(`Invalid write back mode: ${mode}`);
    }
}



// Returns new path
// TODO: rethink return type
// Writeback function should ONLY handle writing tags back to disk and coverart
// Move functioaniltyy is in the same file but a **separate** step
export function writeBackItem(item: Item, mode: WriteBackMode): string | null {
    if (shouldWriteBack(mode, item)) {

        // handle coverart
        if (!handleCoverArt(item)) {
            console.warn(`Failed to handle cover art for ${item.path}`);
        }


    }
    return ""
}


// == File moving logic

export function moveItem(item: Item): boolean {

        // Extract file extension (e.g. "mp3") for later reattachment
        const ext = item.path.split('.').pop()!;

        // Parse the path template from config, evaluate it with item metadata, and reattach file extension at the end
        const nodes = parse((lex(globalConfig.path)))

        const clean_music_path = (globalConfig.music_directory.endsWith('/') ? globalConfig.music_directory : globalConfig.music_directory + '/')
            .replace("~", process.env.HOME || '')  // ensure music_directory ends with '/' and expand ~ to home dir;

        // vars available to path template: $albumartist, $album, $track, $title (extend as needed)
        // TODO: make this dynamic?
        const result = clean_music_path + evaluate(nodes, {
            albumartist: item.albumartist || '',
            album: item.album || '',
            track: item.track ? String(item.track).padStart(2, '0') : '',
            title: item.title || '',
        }, globalConfig.bucket).concat('.' + ext)  // add file extension back on;

        // Only move file if the evaluated path is different from current path
        const shouldMove = item.path !== result;

        //FIXME: always returns some string; not what I wanted.
        if (shouldMove && moveFile(item.path, result)) {
            return true
        } else return false;
}


function moveFile(oldPath: string, newPath: string): boolean {

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
            if (!value) throw new Error(`Undefined var: $${varName}`);
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
