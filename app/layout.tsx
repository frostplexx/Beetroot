import type { Metadata } from "next"
import {
    Geist,
    Geist_Mono,
    Inter,
    Space_Grotesk,
} from "next/font/google"

import "./globals.css"

import { cn } from "@/lib/ui/utils"
import { ThemeProvider } from "@/components/theme-provider"
import Navigation from "@/components/navigation"

const spaceGroteskHeading = Space_Grotesk({
    subsets: ["latin"],
    variable: "--font-heading",
})

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-sans",
})

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
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
                geistSans.variable,
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
                    <Navigation />
                    <main className="flex-1">{children}</main>
                </ThemeProvider>
            </body>
        </html>
    )
}
