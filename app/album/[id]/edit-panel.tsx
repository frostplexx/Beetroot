"use client"

import * as React from "react"
import { Album } from "@/lib/music/database"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
    Check,
    Sparkles,
    AlertCircle,
    Search,
    ExternalLink,
    ChevronDown,
    ChevronRight,
    Database,
    Music,
} from "lucide-react"
import Image from "next/image"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface EditPanelProps {
    album: Album
    image: string | null
    songs: any[]
    onClose: () => void
    onSavingChange?: (saving: boolean) => void
}

interface AlternativeArtwork {
    source: string
    url: string
    thumbnail?: string
}

interface MusicBrainzTrack {
    position: number
    title: string
    artist: string
    composer?: string
    length: number
    isrc?: string
}

interface MusicBrainzRelease {
    id: string
    title: string
    artist: string
    date: string
    country: string
    label: string
    catalog?: string
    barcode?: string
    status?: string
    packaging?: string
    score?: number
    tracks?: MusicBrainzTrack[]
    trackCount?: number
}

export function EditPanel({ album, image, songs, onClose, onSavingChange }: EditPanelProps) {
    const [formData, setFormData] = React.useState({
        album: album.album,
        albumartist: album.albumartist || "",
        year: album.year || "",
        country: album.country || "",
        label: album.label || "",
        genres: album.genres || "",
        image: image || album.image || "",
        catalognum: (album as any).catalognum || "",
        barcode: (album as any).barcode || "",
    })
    const [alternatives, setAlternatives] = React.useState<AlternativeArtwork[]>([])
    const [loadingAlternatives, setLoadingAlternatives] = React.useState(true)
    const [saving, setSaving] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [tracksData, setTracksData] = React.useState(
        songs.map(song => ({
            id: song.id,
            title: song.title || "",
            artist: song.artist || "",
            albumartist: song.albumartist || "",
            composer: song.composers || song.composer || "",
            track: song.track || "",
            disc: song.disc || "",
            length: song.length || 0,
            bpm: song.bpm || "",
            isrc: song.isrc || "",
            comments: song.comments || "",
            lyrics: song.lyrics || "",
            genre: song.genre || "",
            year: song.year || "",
            originalDate: song.original_date || "",
        }))
    )
    const [expandedTrack, setExpandedTrack] = React.useState<number | null>(null)

    // MusicBrainz
    const [mbSearchQuery, setMbSearchQuery] = React.useState(album.album)
    const [mbReleases, setMbReleases] = React.useState<MusicBrainzRelease[]>([])
    const [selectedMbRelease, setSelectedMbRelease] = React.useState<MusicBrainzRelease | null>(null)
    const [loadingMb, setLoadingMb] = React.useState(true)
    const [mbView, setMbView] = React.useState<"results" | "data">("data")

    // MOCK DATA — realistic variants based on actual album, sorted oldest first
    const baseYear = parseInt(String(album.year)) || new Date().getFullYear()
    const baseCountry = album.country || "US"
    const baseLabel = album.label || "Unknown Label"

    const mockMbReleases: MusicBrainzRelease[] = [
        {
            id: "f3a1b2c3-d4e5-6f78-9012-3456789abcde",
            title: album.album,
            artist: album.albumartist || "",
            date: `${baseYear}-01-15`,
            country: baseCountry,
            label: baseLabel,
            catalog: "ORG-001",
            barcode: "0190295823559",
            status: "Official",
            packaging: "Jewel Case",
            score: 100,
            trackCount: songs.length,
            tracks: songs.map((song, i) => ({
                position: i + 1,
                title: song.title || `Track ${i + 1}`,
                artist: album.albumartist || "",
                composer: album.albumartist || "",
                length: 215000,
                isrc: `USRC1${String(i).padStart(7, '0')}`,
            })),
        },
        {
            id: "c3d4e5f6-a7b8-9012-3456-789abcdef012",
            title: album.album,
            artist: album.albumartist || "",
            date: `${baseYear}-03-01`,
            country: "JP",
            label: baseLabel + " Japan",
            catalog: "JP-65000",
            barcode: "4988006704893",
            status: "Official",
            packaging: "Jewel Case",
            score: 88,
            trackCount: songs.length,
        },
        {
            id: "e5f6a7b8-c9d0-1234-5678-9abcdef01234",
            title: album.album,
            artist: album.albumartist || "",
            date: `${baseYear}-06-20`,
            country: "GB",
            label: baseLabel + " UK",
            catalog: "UK-804",
            barcode: "5099969404511",
            status: "Official",
            packaging: "Jewel Case",
            score: 82,
            trackCount: songs.length,
        },
        {
            id: "a1b2c3d4-e5f6-7890-1234-56789abcdef0",
            title: album.album + " (Deluxe Edition)",
            artist: album.albumartist || "",
            date: `${baseYear + 1}-09-22`,
            country: baseCountry,
            label: baseLabel,
            catalog: "DLX-3201",
            barcode: "886973920128",
            status: "Official",
            packaging: "Digipak",
            score: 92,
            trackCount: songs.length + 2,
        },
        {
            id: "b2c3d4e5-f6a7-8901-2345-6789abcdef01",
            title: album.album + " (Anniversary Edition)",
            artist: album.albumartist || "",
            date: `${baseYear + 5}-06-14`,
            country: baseCountry,
            label: baseLabel,
            catalog: "ANN-46001",
            barcode: "077774600125",
            status: "Official",
            packaging: "Digipak",
            score: 85,
            trackCount: songs.length + 5,
        },
        {
            id: "d4e5f6a7-b8c9-0123-4567-89abcdef0123",
            title: album.album + " (Vinyl Reissue)",
            artist: album.albumartist || "",
            date: `${baseYear + 10}-11-25`,
            country: baseCountry,
            label: baseLabel,
            catalog: "VIN-7160",
            barcode: "5099969404599",
            status: "Official",
            packaging: "Gatefold",
            score: 78,
            trackCount: songs.length,
        },
        {
            id: "f6a7b8c9-d0e1-2345-6789-abcdef012345",
            title: album.album + " (Promo)",
            artist: album.albumartist || "",
            date: `${baseYear}-01-01`,
            country: baseCountry,
            label: baseLabel,
            catalog: "PRO-2345",
            barcode: "",
            status: "Promotion",
            packaging: "Cardboard Sleeve",
            score: 72,
            trackCount: songs.length - 1,
        },
        {
            id: "a7b8c9d0-e1f2-3456-789a-bcdef0123456",
            title: album.album + " (Streaming Edition)",
            artist: album.albumartist || "",
            date: `${baseYear + 3}-02-10`,
            country: "XW",
            label: baseLabel,
            catalog: "DIG-46001",
            barcode: "",
            status: "Official",
            packaging: "None",
            score: 68,
            trackCount: songs.length,
        },
    ].sort((a, b) => a.date.localeCompare(b.date))

    React.useEffect(() => {
        if (alternatives.length === 0) {
            setLoadingAlternatives(true)
            fetch(`/api/album/${album.id}/alternatives`)
                .then(res => res.json())
                .then(data => setAlternatives(data.alternatives || []))
                .catch(err => console.error(err))
                .finally(() => setLoadingAlternatives(false))
        }
    }, [album.id, alternatives.length])

    const searchMusicBrainz = () => {
        setLoadingMb(true)
        setMbView("results")
        setTimeout(() => {
            setMbReleases(mockMbReleases)
            setSelectedMbRelease(mockMbReleases[0])
            setLoadingMb(false)
        }, 300)
    }

    React.useEffect(() => {
        searchMusicBrainz()
    }, [])

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setSaving(true)
        onSavingChange?.(true)
        setError(null)
        try {
            const response = await fetch(`/api/album/${album.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'Failed to update album')
            window.location.reload()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save changes')
        } finally {
            setSaving(false)
            onSavingChange?.(false)
        }
    }

    const updateTrack = (index: number, field: string, value: any) => {
        const newTracks = [...tracksData]
        ;(newTracks[index] as any)[field] = value
        setTracksData(newTracks)
    }

    const formatLength = (ms: number) => {
        if (!ms) return ""
        const seconds = Math.floor(ms / 1000)
        const m = Math.floor(seconds / 60)
        const s = seconds % 60
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    const getTrackSuggestion = (index: number) => selectedMbRelease?.tracks?.[index]

    return (
        <ScrollArea className="h-full">
            {error && (
                <div className="container mx-auto px-4 pt-2 max-w-[1600px]">
                    <div className="bg-red-500/10 border border-red-500/40 rounded-md p-2.5 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-200">{error}</p>
                    </div>
                </div>
            )}
            <form id="album-edit-form" onSubmit={handleSubmit} className="container mx-auto px-4 py-4 max-w-[1600px]">
                {/* Top: Three columns */}
                <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_340px] gap-5">

                    {/* === LEFT: Artwork === */}
                    <div className="space-y-2">
                        <SectionHeader>Artwork</SectionHeader>
                        {formData.image ? (
                            <div className="relative aspect-square w-full rounded-lg overflow-hidden ring-1 ring-border/50 shadow-lg">
                                <Image src={formData.image} alt="Album" fill className="object-cover" priority />
                            </div>
                        ) : (
                            <Skeleton className="aspect-square w-full rounded-lg" />
                        )}

                        {/* Always reserve space for alternatives grid (4x3) */}
                        <div className="grid grid-cols-4 gap-1">
                            {loadingAlternatives ? (
                                Array.from({ length: 12 }).map((_, idx) => (
                                    <Skeleton key={`alt-skel-${idx}`} className="aspect-square rounded" />
                                ))
                            ) : alternatives.length > 0 ? (
                                alternatives.slice(0, 12).map((alt, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        className={cn(
                                            "relative aspect-square rounded overflow-hidden transition-all",
                                            formData.image === alt.url
                                                ? 'ring-2 ring-primary'
                                                : 'ring-1 ring-border/40 hover:ring-primary/60 opacity-70 hover:opacity-100'
                                        )}
                                        onClick={() => setFormData({ ...formData, image: alt.url })}
                                        title={alt.source}
                                    >
                                        <Image src={alt.thumbnail || alt.url} alt={alt.source} fill className="object-cover" unoptimized />
                                        {formData.image === alt.url && (
                                            <div className="absolute inset-0 bg-primary/30 flex items-center justify-center">
                                                <Check className="w-3 h-3 text-white" />
                                            </div>
                                        )}
                                    </button>
                                ))
                            ) : (
                                <div className="col-span-4 text-[10px] text-muted-foreground text-center py-2">
                                    No alternatives available
                                </div>
                            )}
                        </div>
                    </div>

                    {/* === MIDDLE: Metadata Fields === */}
                    <div className="space-y-3">
                        <SectionHeader>Metadata</SectionHeader>

                        <FieldWithSuggestion
                            label="Album"
                            value={formData.album}
                            onChange={(v) => setFormData({ ...formData, album: v })}
                            suggestion={selectedMbRelease?.title}
                        />

                        <FieldWithSuggestion
                            label="Artist"
                            value={formData.albumartist}
                            onChange={(v) => setFormData({ ...formData, albumartist: v })}
                            suggestion={selectedMbRelease?.artist}
                        />

                        <div className="grid grid-cols-3 gap-2">
                            <FieldWithSuggestion
                                label="Year"
                                value={formData.year}
                                onChange={(v) => setFormData({ ...formData, year: v })}
                                suggestion={selectedMbRelease?.date?.split('-')[0]}
                                type="number"
                            />
                            <FieldWithSuggestion
                                label="Country"
                                value={formData.country}
                                onChange={(v) => setFormData({ ...formData, country: v })}
                                suggestion={selectedMbRelease?.country}
                            />
                            <FieldWithSuggestion
                                label="Label"
                                value={formData.label}
                                onChange={(v) => setFormData({ ...formData, label: v })}
                                suggestion={selectedMbRelease?.label}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <FieldWithSuggestion
                                label="Catalog #"
                                value={formData.catalognum}
                                onChange={(v) => setFormData({ ...formData, catalognum: v })}
                                suggestion={selectedMbRelease?.catalog}
                            />
                            <FieldWithSuggestion
                                label="Barcode"
                                value={formData.barcode}
                                onChange={(v) => setFormData({ ...formData, barcode: v })}
                                suggestion={selectedMbRelease?.barcode}
                            />
                        </div>

                        <FieldWithSuggestion
                            label="Genres"
                            value={formData.genres}
                            onChange={(v) => setFormData({ ...formData, genres: v })}
                            multiline
                            placeholder="rock, alternative, indie"
                        />
                    </div>

                    {/* === RIGHT: MusicBrainz (Search + Data combined) === */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <SectionHeader>
                                <Database className="w-3 h-3 inline mr-1" />
                                MusicBrainz
                            </SectionHeader>
                            {selectedMbRelease && (
                                <a
                                    href={`https://musicbrainz.org/release/${selectedMbRelease.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-white/80 hover:text-white hover:underline flex items-center gap-1"
                                >
                                    Open <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                            )}
                        </div>

                        {/* Search bar */}
                        <div className="flex gap-1">
                            <Input
                                value={mbSearchQuery}
                                onChange={(e) => setMbSearchQuery(e.target.value)}
                                placeholder="Search MusicBrainz..."
                                className="h-8 text-xs"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault()
                                        searchMusicBrainz()
                                    }
                                }}
                            />
                            <Button type="button" size="sm" onClick={searchMusicBrainz} disabled={loadingMb} className="shrink-0 h-8 w-8 p-0">
                                <Search className="w-3.5 h-3.5" />
                            </Button>
                        </div>

                        {/* Tab toggle */}
                        <div className="flex gap-0.5 p-0.5 bg-muted/30 rounded">
                            <button
                                type="button"
                                onClick={() => setMbView("data")}
                                className={cn(
                                    "flex-1 text-[10px] font-semibold uppercase tracking-wider py-1.5 rounded transition-colors",
                                    mbView === "data" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Reference
                            </button>
                            <button
                                type="button"
                                onClick={() => setMbView("results")}
                                className={cn(
                                    "flex-1 text-[10px] font-semibold uppercase tracking-wider py-1.5 rounded transition-colors",
                                    mbView === "results" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Results ({mbReleases.length})
                            </button>
                        </div>

                        {/* Content — fixed height container so toggling doesn't shift layout */}
                        <div className="h-[460px] border border-border/50 rounded-md overflow-hidden">
                            {mbView === "data" && (
                                <ScrollArea className="h-full">
                                    <div className="p-2.5 space-y-1.5 text-[11px]">
                                        {loadingMb || !selectedMbRelease ? (
                                            <MbDataSkeleton />
                                        ) : (
                                            <>
                                                <DataRow label="MBID" value={selectedMbRelease.id} mono />
                                                <DataRow label="Title" value={selectedMbRelease.title} />
                                                <DataRow label="Artist" value={selectedMbRelease.artist} />
                                                <DataRow label="Date" value={selectedMbRelease.date} />
                                                <DataRow label="Country" value={selectedMbRelease.country} />
                                                <DataRow label="Label" value={selectedMbRelease.label} />
                                                {selectedMbRelease.catalog && <DataRow label="Catalog" value={selectedMbRelease.catalog} mono />}
                                                {selectedMbRelease.barcode && <DataRow label="Barcode" value={selectedMbRelease.barcode} mono />}
                                                {selectedMbRelease.status && <DataRow label="Status" value={selectedMbRelease.status} />}
                                                {selectedMbRelease.packaging && <DataRow label="Packaging" value={selectedMbRelease.packaging} />}
                                                <DataRow label="Tracks" value={String(selectedMbRelease.trackCount || 0)} />
                                                {selectedMbRelease.score && <DataRow label="Match" value={`${selectedMbRelease.score}%`} highlight />}
                                            </>
                                        )}
                                    </div>
                                </ScrollArea>
                            )}

                            {mbView === "results" && (
                                <ScrollArea className="h-full">
                                    <div className="space-y-1 p-1.5">
                                        {loadingMb ? (
                                            Array.from({ length: 6 }).map((_, idx) => (
                                                <MbResultSkeleton key={`mb-skel-${idx}`} />
                                            ))
                                        ) : mbReleases.length > 0 ? (
                                            mbReleases.map((release) => (
                                                <button
                                                    key={release.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedMbRelease(release)
                                                    }}
                                                    className={cn(
                                                        "w-full text-left p-2 rounded text-xs border transition-all",
                                                        selectedMbRelease?.id === release.id
                                                            ? "bg-white/15 border-white/60"
                                                            : "bg-muted/20 border-border/50 hover:bg-muted/40 hover:border-border"
                                                    )}
                                                >
                                                    <div className="font-semibold truncate text-foreground">{release.title}</div>
                                                    <div className="text-muted-foreground truncate text-[11px]">{release.artist}</div>
                                                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                                                        <span>{release.date?.split('-')[0]}</span>
                                                        <span>·</span>
                                                        <span>{release.country}</span>
                                                        <span>·</span>
                                                        <span>{release.trackCount} tr</span>
                                                        {release.score && (
                                                            <span className={cn(
                                                                "ml-auto font-semibold",
                                                                release.score >= 90 ? "text-white" :
                                                                release.score >= 75 ? "text-white/70" :
                                                                "text-white/50"
                                                            )}>
                                                                {release.score}%
                                                            </span>
                                                        )}
                                                    </div>
                                                </button>
                                            ))
                                        ) : (
                                            <div className="text-center py-8 text-xs text-muted-foreground">
                                                No results. Try a different search.
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            )}
                        </div>
                    </div>
                </div>

                {/* === BOTTOM: Tracks === */}
                <div className="mt-6 space-y-2">
                    <div className="flex items-center justify-between">
                        <SectionHeader>
                            <Music className="w-3 h-3 inline mr-1" />
                            Tracks
                        </SectionHeader>
                        <span className="text-[10px] text-muted-foreground">
                            {tracksData.length} {tracksData.length === 1 ? 'track' : 'tracks'}
                            {selectedMbRelease?.tracks && ` · ${selectedMbRelease.tracks.length} in MB`}
                        </span>
                    </div>

                    <div className="border border-border/50 rounded-md overflow-hidden divide-y divide-border/50 bg-muted/10">
                        {tracksData.map((track, index) => {
                            const isExpanded = expandedTrack === index
                            const suggestion = getTrackSuggestion(index)
                            const hasDifference = suggestion && (
                                suggestion.title !== track.title ||
                                suggestion.artist !== track.artist
                            )

                            return (
                                <div key={track.id}>
                                    {/* Collapsed Row */}
                                    <button
                                        type="button"
                                        onClick={() => setExpandedTrack(isExpanded ? null : index)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                                            isExpanded ? "bg-muted/30" : "hover:bg-muted/20"
                                        )}
                                    >
                                        {isExpanded ? (
                                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                        ) : (
                                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                        )}
                                        <span className="text-xs font-mono text-muted-foreground w-6 shrink-0">
                                            {String(index + 1).padStart(2, '0')}
                                        </span>
                                        <div className="flex-1 min-w-0 grid grid-cols-[2fr_1fr_60px] gap-3 items-center">
                                            <span className="text-sm truncate">
                                                {track.title || <span className="text-muted-foreground italic">Untitled</span>}
                                            </span>
                                            <span className="text-xs text-muted-foreground truncate">{track.artist}</span>
                                            <span className="text-xs text-muted-foreground font-mono text-right">
                                                {formatLength(track.length)}
                                            </span>
                                        </div>
                                        {hasDifference && (
                                            <span className="text-[10px] text-white font-semibold bg-white/10 border border-white/30 px-1.5 py-0.5 rounded shrink-0 flex items-center gap-0.5">
                                                <Sparkles className="w-2.5 h-2.5" />
                                                MB
                                            </span>
                                        )}
                                    </button>

                                    {/* Expanded Edit Form */}
                                    {isExpanded && (
                                        <div className="px-4 pb-4 pt-2 bg-muted/10 space-y-3">
                                            {/* Row 1: Title (full width) */}
                                            <FieldWithSuggestion
                                                label="Title"
                                                value={track.title}
                                                onChange={(v) => updateTrack(index, 'title', v)}
                                                suggestion={suggestion?.title}
                                                compact
                                            />

                                            {/* Row 2: Artist + Album Artist */}
                                            <div className="grid grid-cols-2 gap-2">
                                                <FieldWithSuggestion
                                                    label="Artist"
                                                    value={track.artist}
                                                    onChange={(v) => updateTrack(index, 'artist', v)}
                                                    suggestion={suggestion?.artist}
                                                    compact
                                                />
                                                <FieldWithSuggestion
                                                    label="Album Artist"
                                                    value={track.albumartist}
                                                    onChange={(v) => updateTrack(index, 'albumartist', v)}
                                                    compact
                                                />
                                            </div>

                                            {/* Row 3: Composer */}
                                            <FieldWithSuggestion
                                                label="Composer"
                                                value={track.composer}
                                                onChange={(v) => updateTrack(index, 'composer', v)}
                                                suggestion={suggestion?.composer}
                                                compact
                                            />

                                            {/* Row 4: Track #, Disc #, BPM, Year */}
                                            <div className="grid grid-cols-4 gap-2">
                                                <FieldWithSuggestion
                                                    label="Track #"
                                                    value={String(track.track || "")}
                                                    onChange={(v) => updateTrack(index, 'track', v)}
                                                    type="number"
                                                    compact
                                                />
                                                <FieldWithSuggestion
                                                    label="Disc #"
                                                    value={String(track.disc || "")}
                                                    onChange={(v) => updateTrack(index, 'disc', v)}
                                                    type="number"
                                                    compact
                                                />
                                                <FieldWithSuggestion
                                                    label="BPM"
                                                    value={String(track.bpm || "")}
                                                    onChange={(v) => updateTrack(index, 'bpm', v)}
                                                    type="number"
                                                    compact
                                                />
                                                <FieldWithSuggestion
                                                    label="Year"
                                                    value={String(track.year || "")}
                                                    onChange={(v) => updateTrack(index, 'year', v)}
                                                    type="number"
                                                    compact
                                                />
                                            </div>

                                            {/* Row 5: Genre + ISRC */}
                                            <div className="grid grid-cols-2 gap-2">
                                                <FieldWithSuggestion
                                                    label="Genre"
                                                    value={track.genre}
                                                    onChange={(v) => updateTrack(index, 'genre', v)}
                                                    compact
                                                />
                                                <FieldWithSuggestion
                                                    label="ISRC"
                                                    value={track.isrc}
                                                    onChange={(v) => updateTrack(index, 'isrc', v)}
                                                    suggestion={suggestion?.isrc}
                                                    compact
                                                />
                                            </div>

                                            {/* Row 6: Comments */}
                                            <FieldWithSuggestion
                                                label="Comments"
                                                value={track.comments}
                                                onChange={(v) => updateTrack(index, 'comments', v)}
                                                compact
                                                multiline
                                            />

                                            {/* Row 7: Lyrics */}
                                            <FieldWithSuggestion
                                                label="Lyrics"
                                                value={track.lyrics}
                                                onChange={(v) => updateTrack(index, 'lyrics', v)}
                                                compact
                                                multiline
                                            />
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>

            </form>
        </ScrollArea>
    )
}

function MbDataSkeleton() {
    return (
        <>
            {[80, 70, 50, 60, 40, 75, 65, 55, 45, 50, 30, 40].map((width, idx) => (
                <div key={idx} className="flex items-start gap-2">
                    <Skeleton className="h-2.5 w-16 shrink-0 mt-1" />
                    <Skeleton
                        className="h-3 flex-1"
                        style={{ maxWidth: `${width}%` }}
                    />
                </div>
            ))}
        </>
    )
}

function MbResultSkeleton() {
    return (
        <div className="p-2 rounded border border-border/50 bg-muted/10 space-y-1.5">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
            <div className="flex items-center gap-1.5 pt-0.5">
                <Skeleton className="h-2 w-8" />
                <Skeleton className="h-2 w-6" />
                <Skeleton className="h-2 w-10" />
                <Skeleton className="h-2 w-8 ml-auto" />
            </div>
        </div>
    )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
    return (
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {children}
        </h3>
    )
}

function DataRow({
    label,
    value,
    mono = false,
    highlight = false
}: {
    label: string
    value: string
    mono?: boolean
    highlight?: boolean
}) {
    return (
        <div className="flex items-start gap-2">
            <span className="text-muted-foreground w-16 shrink-0 text-[9px] uppercase tracking-wider pt-0.5">
                {label}
            </span>
            <span
                className={cn(
                    "flex-1 break-all leading-tight",
                    mono && "font-mono text-[10px]",
                    highlight && "text-white font-semibold"
                )}
            >
                {value}
            </span>
        </div>
    )
}

function FieldWithSuggestion({
    label,
    value,
    onChange,
    suggestion,
    type = "text",
    multiline = false,
    placeholder,
    compact = false,
}: {
    label: string
    value: string
    onChange: (value: string) => void
    suggestion?: string
    type?: string
    multiline?: boolean
    placeholder?: string
    compact?: boolean
}) {
    const InputComponent = multiline ? Textarea : Input
    const hasSuggestion = suggestion && suggestion.trim() !== "" && suggestion !== value

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 h-[18px]">
                <label className={cn(
                    "font-semibold uppercase tracking-wider text-muted-foreground",
                    compact ? "text-[9px]" : "text-[10px]"
                )}>
                    {label}
                </label>
                {hasSuggestion && (
                    <button
                        type="button"
                        onClick={() => onChange(suggestion!)}
                        className="flex items-center gap-1 text-[10px] text-white/90 hover:text-white font-semibold transition-colors group shrink-0"
                    >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span className="max-w-[140px] truncate group-hover:underline">
                            {suggestion}
                        </span>
                        <Check className="w-2.5 h-2.5" />
                    </button>
                )}
            </div>
            <InputComponent
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={cn(
                    compact ? "h-8 text-sm" : "h-9",
                    multiline && "min-h-[60px] resize-none",
                    hasSuggestion && "border-white/40"
                )}
            />
        </div>
    )
}
