import * as React from "react";
import {
    createRootRouteWithContext,
    HeadContent,
    Outlet,
    Scripts,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./globals.css"; // forces the client bundle to emit globals.css as a file
import appCss from "./globals.css?url";
import { cn } from "@/lib/ui/utils";
import Navigation from "@/components/navigation";
import SystemBanner from "@/components/ui/system-banner";
import { TooltipProvider } from "@/components/ui/tooltip";

interface RouterContext {
    queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
    head: () => ({
        meta: [
            { charSet: "utf-8" },
            { name: "viewport", content: "width=device-width, initial-scale=1" },
            { title: "Beetroot — Music Library" },
            { name: "description", content: "Modern music library with dynamic theming" },
        ],
        links: [{ rel: "stylesheet", href: appCss }],
    }),
    component: RootLayout,
    notFoundComponent: NotFound,
});

function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-white/60 gap-2">
            <p className="text-lg font-semibold">404</p>
            <p className="text-sm">Page not found</p>
        </div>
    );
}

function RootLayout() {
    return (
        <html
            lang="en"
            suppressHydrationWarning
            className={cn("h-full antialiased font-sans dark")}
        >
            <head>
                <HeadContent />
            </head>
            <body className="h-screen flex flex-col bg-[#0a0a0a] text-white noise overflow-hidden">
                {/* Global ambient glow — Raycast-style background blobs */}
                <div
                    className="fixed inset-0 pointer-events-none -z-10 overflow-hidden"
                    aria-hidden
                >
                    <div
                        className="absolute -top-[200px] left-1/2 -translate-x-1/2 w-[900px] h-[700px] rounded-full opacity-[0.055] blur-[140px]"
                        style={{
                            background:
                                "radial-gradient(ellipse, #e84140 0%, #c0392b 40%, transparent 70%)",
                        }}
                    />
                    <div
                        className="absolute top-[40%] -right-[200px] w-[500px] h-[500px] rounded-full opacity-[0.025] blur-[100px]"
                        style={{
                            background:
                                "radial-gradient(ellipse, #e84140 0%, transparent 70%)",
                        }}
                    />
                    <div
                        className="absolute bottom-0 left-[10%] w-[400px] h-[400px] rounded-full opacity-[0.02] blur-[120px]"
                        style={{
                            background:
                                "radial-gradient(ellipse, #e84140 0%, transparent 70%)",
                        }}
                    />
                </div>
                <Providers>
                    <Navigation />
                    <main className="flex-1 relative mt-[72px] overflow-y-auto">
                        <Outlet />
                    </main>
                </Providers>
                <span
                    aria-hidden
                    className="fixed bottom-1 right-1.5 text-[9px] leading-none font-mono text-white/20 select-none pointer-events-none tabular-nums z-50"
                >
                    {__GIT_REF__}
                </span>
                <Scripts />
            </body>
        </html>
    );
}

function Providers({ children }: { children: React.ReactNode }) {
    const [client] = React.useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 60_000,
                        gcTime: 5 * 60_000,
                        refetchOnWindowFocus: false,
                    },
                },
            }),
    );

    return (
        <QueryClientProvider client={client}>
            <TooltipProvider>{children}</TooltipProvider>
        </QueryClientProvider>
    );
}
