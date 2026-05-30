import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    server: {
        port: 3000,
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
        {
            name: "beetroot:reconcile-service",
            async configureServer(server) {
                try {
                    const mod = await server.ssrLoadModule(
                        "/lib/music/repository/reconcile-service.ts"
                    );
                    mod.default.start();

                    const originalPrintUrls = server.printUrls.bind(server);
                    server.printUrls = () => {
                        originalPrintUrls();
                        server.config.logger.info(
                            "  \x1b[32m➜\x1b[0m  Reconcile service running"
                        );
                    };
                } catch (err) {
                    server.config.logger.error(
                        `[beetroot] Failed to start reconcile service: ${err}`
                    );
                }
            },
        },
    ],
});
