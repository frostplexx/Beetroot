import type { Metadata } from "next"
import {
    Geist_Mono,
    Inter,
    Space_Grotesk,
} from "next/font/google"

import "./globals.css"

import { cn } from "@/lib/ui/utils"
import { ThemeProvider } from "@/components/theme-provider"
import Navigation from "@/components/navigation"
import SystemBanner from "@/components/ui/system-banner"
import { TooltipProvider } from "@/components/ui/tooltip"

const spaceGroteskHeading = Space_Grotesk({
    subsets: ["latin"],
    variable: "--font-heading",
    display: "swap",
    preload: true,
    fallback: ["system-ui", "sans-serif"],
    adjustFontFallback: false,
})

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-sans",
    display: "swap",
    preload: true,
})

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
})

export const metadata: Metadata = {
    title: "Beetroot - Music Library",
    description: "Modern music library with dynamic theming",
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html
            lang="en"
            suppressHydrationWarning
            className={cn(
                "h-full",
                "antialiased",
                geistMono.variable,
                "font-sans",
                inter.variable,
                spaceGroteskHeading.variable,
                "dark"
            )}
        >
            <body className="min-h-full flex flex-col bg-[#0a0a0a] text-white noise">
                {/* Global ambient glow — Raycast-style background blobs */}
                <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden" aria-hidden>
                    <div className="absolute -top-[200px] left-1/2 -translate-x-1/2 w-[900px] h-[700px] rounded-full opacity-[0.055] blur-[140px]"
                        style={{ background: "radial-gradient(ellipse, #e84140 0%, #c0392b 40%, transparent 70%)" }} />
                    <div className="absolute top-[40%] -right-[200px] w-[500px] h-[500px] rounded-full opacity-[0.025] blur-[100px]"
                        style={{ background: "radial-gradient(ellipse, #e84140 0%, transparent 70%)" }} />
                    <div className="absolute bottom-0 left-[10%] w-[400px] h-[400px] rounded-full opacity-[0.02] blur-[120px]"
                        style={{ background: "radial-gradient(ellipse, #e84140 0%, transparent 70%)" }} />
                </div>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="dark"
                    enableSystem={false}
                    disableTransitionOnChange
                >
                    <TooltipProvider>
                    <SystemBanner
                        text="You are in Development Mode"
                        color="bg-orange-500"
                        size="sm"
                        show={process.env.NODE_ENV === "development"}
                    />
                    <Navigation />
                    <main className="flex-1 relative mt-[75px]">{children}</main>
                    </TooltipProvider>
                </ThemeProvider>
            </body>
        </html>
    )
}
