import * as fs from 'fs'
import * as yaml from 'js-yaml'

export type ConflictResolution = 'keep-db' | 'keep-file' | 'keep-mb' | 'manual';
export type WriteBackMode = 'always' | 'never' | 'missing-only';

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

    trash_directory: string;
    delete_after: number; // days
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
    trash_directory: '.trash/',
    delete_after: 30,
};

// globalConfig gets loaded from yaml file
export const globalConfig: GlobalConfig = loadConfig()


function loadConfig(): GlobalConfig {
    const configPath = getConfigPath()
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found at ${configPath}`)
    }
    const fileContents = fs.readFileSync(configPath, 'utf-8')
    const config = yaml.load(fileContents) as GlobalConfig

    // Merge with defaults
    return {
        ...DEFAULT_CONFIG,
        ...config,
    } as GlobalConfig;
}


function getConfigPath(): string {
    const envPath = process.env.CONFIG_PATH
    if (envPath) {
        return envPath
    }
    return 'config.yaml'
}


