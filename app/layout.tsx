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
            <body className="min-h-full flex flex-col bg-black text-white">
                <ThemeProvider
                    attribute="class"
                    defaultTheme="dark"
                    enableSystem={false}
                    disableTransitionOnChange
                >
                    <TooltipProvider>
                    <Navigation />
                    <SystemBanner
                        text="You are in Development Mode"
                        color="bg-orange-500"
                        size="sm"
                        show={process.env.NODE_ENV === "development"}
                    />
                    <main className="flex-1 relative">{children}</main>
                    </TooltipProvider>
                </ThemeProvider>
            </body>
        </html>
    )
}
