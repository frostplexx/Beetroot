import Database from "better-sqlite3"
import { getDatabasePath, loadConfig } from "./beets/config"

const db = new Database(getDatabasePath(loadConfig()))

export default db
