import * as fs from 'fs'
import * as yaml from 'js-yaml'

export type ConflictResolution = 'keep-db' | 'keep-file' | 'keep-mb' | 'manual';
export type WriteBackMode = 'always' | 'never' | 'missing-only';

interface PathsConfig {
    comp?: string;           // Path template for compilations
    default: string;         // Default path template
    singleton?: string;      // Path template for non-album tracks
}

interface GlobalConfig {
    database_path: string;
    acoustid_api_key: string;
    lastfm_api_key: string;
    music_directory: string;

    // Optional Spotify credentials for album art
    spotify_client_id?: string;
    spotify_client_secret?: string;

    // Repository settings
    conflict_resolution?: ConflictResolution;
    writeback_mode?: WriteBackMode;
    paths?: PathsConfig;
}

// Default configuration
const DEFAULT_CONFIG: Partial<GlobalConfig> = {
    conflict_resolution: 'keep-db',
    writeback_mode: 'never',
    paths: {
        comp: 'Compilations/$album/$track $title',
        default: '%bucket{$albumartist,alpha}/$albumartist/$album/$track $title',
        singleton: '%bucket{$artist,alpha}/$artist/$album/$title',
    },
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
        paths: {
            ...DEFAULT_CONFIG.paths,
            ...config.paths,
        },
    } as GlobalConfig;
}


function getConfigPath(): string {
    const envPath = process.env.CONFIG_PATH
    if (envPath) {
        return envPath
    }
    return 'config.yaml'
}


