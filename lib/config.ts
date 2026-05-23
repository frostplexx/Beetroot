import * as fs from 'fs'
import * as yaml from 'js-yaml'
import * as path from 'path'
import * as os from 'os'
import { config } from 'process';

export type ConflictResolution = 'keep-db' | 'keep-file' | 'keep-mb' | 'manual';
export type WriteBackMode = 'always' | 'never' | 'missing-only';
export type DuplicateDetection = 'mb_trackid' | 'file_hash' | 'path';
export type DuplicateAction = 'skip' | 'overwrite';

export interface BucketConfig {
    alpha: string[]; // e.g. "A-F"
    year: string[];  // e.g. "1960s"
}

interface GlobalConfig {
    database_path: string;
    acoustid_api_key: string;
    lastfm_api_key: string;
    music_directory: string;

    // Optional API keys
    discogs_token?: string;

    // Repository settings
    conflict_resolution?: ConflictResolution;
    writeback_mode?: WriteBackMode;
    path: string
    bucket: BucketConfig;

    trash_directory?: string;
    delete_after: number; // days
    reconcile_on_startup: boolean;
    reconcile_interval: number; // minutes

    // Duplicate handling settings
    duplicate_detection?: DuplicateDetection;
    duplicate_action?: DuplicateAction;
    compute_file_hash?: boolean;
}

// Default configuration
const DEFAULT_CONFIG: Partial<GlobalConfig> = {
    conflict_resolution: 'keep-db',
    writeback_mode: 'missing-only',
    path: '%bucket{$albumartist,alpha}/$albumartist/$album/$track $title',
    bucket: {
        alpha: ['A-F', 'G-M', 'N-Z'],
        year: ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s']
    },
    delete_after: 30,
    reconcile_on_startup: true,
    reconcile_interval: 60, // 60 minutes
    duplicate_detection: 'mb_trackid',
    duplicate_action: 'skip',
    compute_file_hash: true,
};

// Normalize directory path: expand ~, resolve to absolute, add trailing /
function normalizeDirectoryPath(dirPath: string | undefined): string | undefined {
    if (!dirPath) return undefined;

    // Expand ~ to home directory
    let normalized = dirPath;
    if (normalized.startsWith('~/')) {
        normalized = path.join(os.homedir(), normalized.slice(2));
    } else if (normalized === '~') {
        normalized = os.homedir();
    }

    // Resolve to absolute path
    normalized = path.resolve(normalized);

    // Ensure trailing slash for consistency
    if (!normalized.endsWith(path.sep)) {
        normalized += path.sep;
    }

    return normalized;
}

// globalConfig gets loaded from yaml file
export const globalConfig: GlobalConfig = loadConfig()


function loadConfig(): GlobalConfig {
    const configPath = getConfigPath()

    // Load from file if exists
    let fileConfig: Partial<GlobalConfig> = {}
    if (fs.existsSync(configPath)) {
        const fileContents = fs.readFileSync(configPath, 'utf-8')
        fileConfig = yaml.load(fileContents) as Partial<GlobalConfig>
    } else if (!hasEnvOverrides()) {
        throw new Error(`Config file not found at ${configPath} and no environment variables provided`)
    }

    // Build environment variable overrides
    const envConfig: Partial<GlobalConfig> = {
        database_path: process.env.DATABASE_PATH,
        music_directory: process.env.MUSIC_DIRECTORY,
        acoustid_api_key: process.env.ACOUSTID_API_KEY,
        lastfm_api_key: process.env.LASTFM_API_KEY,
        discogs_token: process.env.DISCOGS_TOKEN,
        conflict_resolution: process.env.CONFLICT_RESOLUTION as ConflictResolution,
        writeback_mode: process.env.WRITEBACK_MODE as WriteBackMode,
        path: process.env.PATH_TEMPLATE,
        delete_after: process.env.DELETE_AFTER ? parseInt(process.env.DELETE_AFTER, 10) : undefined,
        reconcile_on_startup: process.env.RECONCILE_ON_STARTUP === undefined
            ? undefined
            : process.env.RECONCILE_ON_STARTUP === 'true',
        reconcile_interval: process.env.RECONCILE_INTERVAL ? parseInt(process.env.RECONCILE_INTERVAL, 10) : undefined,
        duplicate_detection: process.env.DUPLICATE_DETECTION as DuplicateDetection,
        duplicate_action: process.env.DUPLICATE_ACTION as DuplicateAction,
        compute_file_hash: process.env.COMPUTE_FILE_HASH === undefined
            ? undefined
            : process.env.COMPUTE_FILE_HASH === 'true',
    }

    // Remove undefined values from envConfig
    Object.keys(envConfig).forEach(key =>
        envConfig[key as keyof GlobalConfig] === undefined && delete envConfig[key as keyof GlobalConfig]
    )

    // Merge: defaults < file < env (env vars have highest priority)
    const mergedConfig = {
        ...DEFAULT_CONFIG,
        ...fileConfig,
        ...envConfig,
    } as GlobalConfig;

    // Normalize directory paths once at load time
    mergedConfig.music_directory = normalizeDirectoryPath(mergedConfig.music_directory) || mergedConfig.music_directory;
    if (mergedConfig.trash_directory) {
        mergedConfig.trash_directory = normalizeDirectoryPath(mergedConfig.trash_directory);
    }

    return mergedConfig;
}

function hasEnvOverrides(): boolean {
    // Check if critical environment variables are provided
    return !!(
        process.env.DATABASE_PATH ||
        process.env.MUSIC_DIRECTORY
    )
}


function getConfigPath(): string {
    const envPath = process.env.CONFIG_PATH
    if (envPath) {
        return envPath
    }
    return 'config.yaml'
}


