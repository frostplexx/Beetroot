import yaml from "js-yaml"

export interface BeetsConfig {
    directory?: string
    library?: string
    [key: string]: any
}

export function loadConfig(): BeetsConfig {
    const configDir = process.env.BEETS_CONFIG_DIR || "."
    const configPath = `${configDir}/config.yaml`
    const fs = require("fs")
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found at ${configPath}`)
    }
    const config = yaml.load(fs.readFileSync(configPath, "utf8"))
    return config as BeetsConfig
}

export function getDatabasePath(config: BeetsConfig): string {
    const configDir = process.env.BEETS_CONFIG_DIR || "."
    return config.library || configDir + "/library.db"
}
