"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Download, X } from "lucide-react"
import { useRouter } from "next/navigation"

interface ScanResult {
    total: number
    new: number
    existing: number
    newFiles: string[]
}

export function AutoImportBanner() {
    const [scanResult, setScanResult] = useState<ScanResult | null>(null)
    const [dismissed, setDismissed] = useState(false)
    const [scanning, setScanning] = useState(false)
    const router = useRouter()

    useEffect(() => {
        // Check for new files on mount
        checkForNewFiles()
    }, [])

    const checkForNewFiles = async () => {
        setScanning(true)
        try {
            const response = await fetch('/api/import?scan=true')
            const data = await response.json()

            if (data.success && data.new > 0) {
                setScanResult(data)
            }
        } catch (error) {
            console.error('Failed to check for new files:', error)
        } finally {
            setScanning(false)
        }
    }

    const handleImport = () => {
        // Redirect to home page which will show the empty library state with import UI
        router.push('/')
        router.refresh()
    }

    if (dismissed || !scanResult || scanResult.new === 0 || scanning) {
        return null
    }

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-2xl w-full px-4">
            <div className="bg-primary text-primary-foreground rounded-lg shadow-lg p-4 flex items-center gap-4">
                <Download className="w-5 h-5 flex-shrink-0" />
                <div className="flex-1">
                    <p className="font-medium">
                        {scanResult.new} new {scanResult.new === 1 ? 'track' : 'tracks'} found
                    </p>
                    <p className="text-sm opacity-90">
                        Would you like to import them now?
                    </p>
                </div>
                <Button
                    onClick={handleImport}
                    variant="secondary"
                    size="sm"
                >
                    Import Now
                </Button>
                <Button
                    onClick={() => setDismissed(true)}
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0 hover:bg-primary-foreground/10"
                >
                    <X className="w-4 h-4" />
                </Button>
            </div>
        </div>
    )
}
