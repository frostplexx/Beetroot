"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface Conflict {
    id: number
    track_id: number
    field: string
    db_value: string
    db_source: string
    file_value: string
    mb_value: string | null
    timestamp: number
    track_title: string
    track_artist: string
    track_album: string
}

export default function ConflictsPage() {
    const [conflicts, setConflicts] = useState<Conflict[]>([])
    const [loading, setLoading] = useState(true)
    const [resolving, setResolving] = useState<number | null>(null)

    useEffect(() => {
        loadConflicts()
    }, [])

    const loadConflicts = async () => {
        try {
            const response = await fetch('/api/conflicts')
            const data = await response.json()

            if (data.success) {
                setConflicts(data.conflicts)
            }
        } catch (error) {
            toast.error('Failed to load conflicts')
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    const resolveConflict = async (conflictId: number, resolution: 'db' | 'file' | 'mb') => {
        setResolving(conflictId)

        try {
            const response = await fetch('/api/conflicts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conflictId, resolution })
            })

            const data = await response.json()

            if (data.success) {
                toast.success('Conflict resolved')
                // Remove from list
                setConflicts(prev => prev.filter(c => c.id !== conflictId))
            } else {
                toast.error(data.error || 'Failed to resolve conflict')
            }
        } catch (error) {
            toast.error('Failed to resolve conflict')
            console.error(error)
        } finally {
            setResolving(null)
        }
    }

    const formatValue = (value: string): string => {
        try {
            const parsed = JSON.parse(value)
            if (Array.isArray(parsed)) {
                return parsed.join(', ')
            }
            return String(parsed)
        } catch {
            return value
        }
    }

    if (loading) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </div>
        )
    }

    if (conflicts.length === 0) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex flex-col items-center justify-center h-64 space-y-4">
                    <CheckCircle2 className="h-12 w-12 text-green-500" />
                    <h2 className="text-2xl font-semibold">No Conflicts</h2>
                    <p className="text-muted-foreground">All tracks are in sync!</p>
                </div>
            </div>
        )
    }

    // Group conflicts by track
    const conflictsByTrack = conflicts.reduce((acc, conflict) => {
        if (!acc[conflict.track_id]) {
            acc[conflict.track_id] = []
        }
        acc[conflict.track_id].push(conflict)
        return acc
    }, {} as Record<number, Conflict[]>)

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Metadata Conflicts</h1>
                    <p className="text-muted-foreground mt-1">
                        {conflicts.length} conflicts across {Object.keys(conflictsByTrack).length} tracks
                    </p>
                </div>
            </div>

            <div className="space-y-6">
                {Object.entries(conflictsByTrack).map(([trackId, trackConflicts]) => {
                    const firstConflict = trackConflicts[0]

                    return (
                        <Card key={trackId}>
                            <CardHeader>
                                <CardTitle className="flex items-start justify-between">
                                    <div>
                                        <div className="text-lg">{firstConflict.track_title}</div>
                                        <div className="text-sm font-normal text-muted-foreground mt-1">
                                            {firstConflict.track_artist} • {firstConflict.track_album}
                                        </div>
                                    </div>
                                    <Badge variant="outline">
                                        {trackConflicts.length} conflict{trackConflicts.length > 1 ? 's' : ''}
                                    </Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {trackConflicts.map(conflict => (
                                    <div
                                        key={conflict.id}
                                        className="border rounded-lg p-4 space-y-3"
                                    >
                                        <div className="flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4 text-yellow-600" />
                                            <span className="font-semibold capitalize">
                                                {conflict.field}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            {/* Database Value */}
                                            <div className="space-y-2">
                                                <div className="text-xs font-medium text-muted-foreground">
                                                    Database ({conflict.db_source})
                                                </div>
                                                <div className="p-2 bg-muted rounded text-sm">
                                                    {formatValue(conflict.db_value)}
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="w-full"
                                                    disabled={resolving === conflict.id}
                                                    onClick={() => resolveConflict(conflict.id, 'db')}
                                                >
                                                    {resolving === conflict.id ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        'Keep This'
                                                    )}
                                                </Button>
                                            </div>

                                            {/* File Value */}
                                            <div className="space-y-2">
                                                <div className="text-xs font-medium text-muted-foreground">
                                                    File (tags)
                                                </div>
                                                <div className="p-2 bg-muted rounded text-sm">
                                                    {formatValue(conflict.file_value)}
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="w-full"
                                                    disabled={resolving === conflict.id}
                                                    onClick={() => resolveConflict(conflict.id, 'file')}
                                                >
                                                    {resolving === conflict.id ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        'Keep This'
                                                    )}
                                                </Button>
                                            </div>

                                            {/* MusicBrainz Value */}
                                            {conflict.mb_value && (
                                                <div className="space-y-2">
                                                    <div className="text-xs font-medium text-muted-foreground">
                                                        MusicBrainz
                                                    </div>
                                                    <div className="p-2 bg-muted rounded text-sm">
                                                        {formatValue(conflict.mb_value)}
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="w-full"
                                                        disabled={resolving === conflict.id}
                                                        onClick={() => resolveConflict(conflict.id, 'mb')}
                                                    >
                                                        {resolving === conflict.id ? (
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                        ) : (
                                                            'Keep This'
                                                        )}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
