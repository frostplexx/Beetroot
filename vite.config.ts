import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
    server: {
        port: 3000,
    },
    base: "/",
    build: {
        outDir: '.output',
        assetsDir: 'assets',
        emptyOutDir: true,
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
        nitro(),
        viteReact(),
    ],
});
