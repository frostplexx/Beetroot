import db from "../lib/db"

console.log("Albums table schema:")
const schema = db.prepare("PRAGMA table_info(albums)").all()
console.log(JSON.stringify(schema, null, 2))

console.log("\nSample album:")
const sample = db.prepare("SELECT * FROM albums LIMIT 1").get()
console.log(JSON.stringify(sample, null, 2))
