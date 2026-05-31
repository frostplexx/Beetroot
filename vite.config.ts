import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { execSync } from "node:child_process";

function gitRef(): string {
    // Build envs (e.g. Docker) may not have git or the .git directory; let the
    // caller pre-resolve the ref and inject it via env to skip the exec entirely.
    if (process.env.GIT_REF) return process.env.GIT_REF;
    try {
        return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
            .toString()
            .trim();
    } catch {
        return "unknown";
    }
}

export default defineConfig({
    server: {
        port: 3000,
    },
    define: {
        __GIT_REF__: JSON.stringify(gitRef()),
    },
    plugins: [
        tsconfigPaths(),
        tailwindcss(),
        tanstackStart({
            srcDirectory: ".",
            server: {
                entry: "./server-entry.ts",
            },
            router: {
                routesDirectory: "app",
            },
        }),
        viteReact(),
    ],
});
