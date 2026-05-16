import { loadConfig, getDatabasePath } from "./config"

interface BeetsGlobals {
    configDir: string
    libraryPath: string
    databasePath: string
    musicDirectory: string | null
}

function initializeGlobals(): BeetsGlobals {
    const configDir = process.env.BEETS_CONFIG_DIR || "."
    const config = loadConfig()
    const databasePath = getDatabasePath(config)
    const musicDirectory = config.directory || null

    return {
        configDir,
        libraryPath: databasePath,
        databasePath,
        musicDirectory,
    }
}

let globals: BeetsGlobals | null = null

export function getGlobals(): BeetsGlobals {
    if (!globals) {
        globals = initializeGlobals()
    }
    return globals
}

export const BEETS = getGlobals()
