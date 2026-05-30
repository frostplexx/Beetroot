import * as path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./dist/server/server-entry.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "dist/client");
const PORT = Number(process.env.PORT) || 3000;

async function tryStatic(pathname: string): Promise<Response | null> {
    if (pathname === "/" || pathname === "") return null;
    const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
    if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return null;
    const file = Bun.file(filePath);
    if (!(await file.exists())) return null;
    return new Response(file);
}

Bun.serve({
    port: PORT,
    async fetch(req: Request) {
        const url = new URL(req.url);
        const staticResponse = await tryStatic(url.pathname);
        if (staticResponse) return staticResponse;
        return (handler as { fetch: (req: Request) => Promise<Response> }).fetch(req);
    },
});

console.log(`Listening on http://localhost:${PORT}`);
