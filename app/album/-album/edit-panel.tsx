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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { DeleteAlbumButton } from "./delete-missing-button"

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
        year: album.year ? String(album.year) : "",
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
            genre: (Array.isArray(song.genres) ? song.genres.join(', ') : song.genres) || "",
            year: song.year || "",
            originalDate: song.original_date || "",
        }))
    )
    const [expandedTrack, setExpandedTrack] = React.useState<number | null>(null)

    // MusicBrainz
    const [mbSearchQuery, setMbSearchQuery] = React.useState(album.album)
    const [mbArtistQuery, setMbArtistQuery] = React.useState(album.albumartist ?? "")
    const [mbReleases, setMbReleases] = React.useState<MusicBrainzRelease[]>([])
    const [selectedMbRelease, setSelectedMbRelease] = React.useState<MusicBrainzRelease | null>(null)
    const [loadingMb, setLoadingMb] = React.useState(true)
    const [mbView, setMbView] = React.useState<"results" | "data">("data")
    const [mbError, setMbError] = React.useState<string | null>(null)

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

    const searchMusicBrainz = async (useExactLookup = false) => {
        setLoadingMb(true)
        setMbView("results")
        setMbError(null)
        try {
            // If useExactLookup is true (initial load), use cluster lookup for best match
            // Otherwise, always use search API with the query
            let url: string
            if (useExactLookup) {
                url = `/api/album/${album.id}/musicbrainz`
            } else {
                const params = new URLSearchParams()
                params.set("q", mbSearchQuery.trim() || album.album)
                const artist = mbArtistQuery.trim()
                if (artist) params.set("artist", artist)
                url = `/api/album/${album.id}/musicbrainz?${params}`
            }
            const response = await fetch(url)
            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to search MusicBrainz')
            }
            const data = await response.json()
            setMbReleases(data.releases || [])
            setSelectedMbRelease(data.selectedRelease || null)
        } catch (err) {
            console.error('MusicBrainz search error:', err)
            setMbError(err instanceof Error ? err.message : 'Failed to search MusicBrainz')
            setMbReleases([])
            setSelectedMbRelease(null)
        } finally {
            setLoadingMb(false)
        }
    }

    React.useEffect(() => {
        searchMusicBrainz(true) // Use cluster lookup for initial best match
    }, [])

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setSaving(true)
        onSavingChange?.(true)
        setError(null)
        try {
            // Step 1: Update album metadata
            const albumResponse = await fetch(`/api/album/${album.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            })
            const albumData = await albumResponse.json()
            if (!albumResponse.ok) throw new Error(albumData.error || 'Failed to update album')

            // Step 2: Update track metadata
            let trackSuccessCount = 0
            let trackErrorCount = 0

            for (const track of tracksData) {
                try {
                    const trackResponse = await fetch(`/api/items/${track.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            title: track.title,
                            artist: track.artist,
                            albumartist: track.albumartist,
                            composers: track.composer,
                            track: track.track ? parseInt(String(track.track)) : undefined,
                            disc: track.disc ? parseInt(String(track.disc)) : undefined,
                            bpm: track.bpm ? parseInt(String(track.bpm)) : undefined,
                            isrc: track.isrc,
                            comments: track.comments,
                            lyrics: track.lyrics,
                            genre: track.genre,
                            year: track.year ? parseInt(String(track.year)) : undefined,
                        }),
                    })
                    if (trackResponse.ok) {
                        trackSuccessCount++
                    } else {
                        trackErrorCount++
                        const trackData = await trackResponse.json()
                        console.error(`Failed to update track ${track.id}:`, trackData.error)
                    }
                } catch (err) {
                    trackErrorCount++
                    console.error(`Failed to update track ${track.id}:`, err)
                }
            }

            console.log(`Track updates: ${trackSuccessCount} succeeded, ${trackErrorCount} failed`)

            // Show warning if some tracks failed
            if (trackErrorCount > 0) {
                setError(`Album updated, but ${trackErrorCount} track(s) failed to update. Check console for details.`)
                setSaving(false)
                onSavingChange?.(false)
                return
            }

            // Reload to show updated data
            window.location.reload()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save changes')
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
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2.5 backdrop-blur-md">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-200">{error}</p>
                    </div>
                </div>
            )}
            <form id="album-edit-form" onSubmit={handleSubmit} className="container mx-auto px-4 py-4 max-w-[1600px]">
                {/* Top: Three columns */}
                <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_340px] gap-6">

                    {/* === LEFT: Artwork === */}
                    <div className="space-y-3">
                        <SectionHeader>Artwork</SectionHeader>
                        {formData.image ? (
                            <div className="relative aspect-square w-full rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl shadow-black/40 transition-all duration-300 hover:ring-white/20 hover:shadow-black/60">
                                <img src={formData.image} alt="Album" className="absolute inset-0 w-full h-full object-cover" />
                            </div>
                        ) : (
                            <Skeleton className="aspect-square w-full rounded-2xl" />
                        )}

                        {/* Always reserve space for alternatives grid (4x3) */}
                        <div className="grid grid-cols-4 gap-1.5">
                            {loadingAlternatives ? (
                                Array.from({ length: 12 }).map((_, idx) => (
                                    <Skeleton key={`alt-skel-${idx}`} className="aspect-square rounded-lg" />
                                ))
                            ) : alternatives.length > 0 ? (
                                alternatives.slice(0, 12).map((alt, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        className={cn(
                                            "relative aspect-square rounded-lg overflow-hidden transition-all duration-200 ease-out",
                                            formData.image === alt.url
                                                ? 'ring-2 ring-white/80 shadow-lg shadow-black/30 scale-[1.02]'
                                                : 'ring-1 ring-white/10 hover:ring-white/40 opacity-60 hover:opacity-100 hover:scale-[1.03] active:scale-[0.98]'
                                        )}
                                        onClick={() => setFormData({ ...formData, image: alt.url })}
                                        title={alt.source}
                                    >
                                        <img src={alt.thumbnail || alt.url} alt={alt.source} className="absolute inset-0 w-full h-full object-cover" />
                                        {formData.image === alt.url && (
                                            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
                                                <div className="bg-white/90 rounded-full p-0.5">
                                                    <Check className="w-3 h-3 text-black" strokeWidth={3} />
                                                </div>
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
                    <div className="space-y-3.5">
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
                                onChange={(v) => {
                                    setFormData(prev => ({ ...prev, year: v }))
                                    setTracksData(prev => prev.map(t => ({ ...t, year: v })))
                                }}
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
                            onChange={(v) => {
                                setFormData(prev => ({ ...prev, genres: v }))
                                setTracksData(prev => prev.map(t => ({ ...t, genre: v })))
                            }}
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
                                    className="text-[10px] text-white/90 hover:text-white hover:underline flex items-center gap-1"
                                >
                                    Open <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                            )}
                        </div>

                        {/* Search bar */}
                        <div className="flex gap-1.5">
                            <div className="flex-1 flex flex-col gap-1">
                                <Input
                                    value={mbSearchQuery}
                                    onChange={(e) => setMbSearchQuery(e.target.value)}
                                    placeholder="Album / single title"
                                    className="h-8 text-xs transition-all duration-150"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault()
                                            searchMusicBrainz()
                                        }
                                    }}
                                />
                                <Input
                                    value={mbArtistQuery}
                                    onChange={(e) => setMbArtistQuery(e.target.value)}
                                    placeholder="Artist (optional)"
                                    className="h-8 text-xs transition-all duration-150"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault()
                                            searchMusicBrainz()
                                        }
                                    }}
                                />
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => searchMusicBrainz()}
                                disabled={loadingMb}
                                className="shrink-0 h-[68px] w-8 p-0 transition-all duration-150 active:scale-90"
                            >
                                <Search className={cn("w-3.5 h-3.5 transition-transform", loadingMb && "animate-pulse")} />
                            </Button>
                        </div>

                        {/* Tab toggle */}
                        <div className="flex gap-0.5 p-0.5 bg-white/[0.04] border border-white/5 rounded-lg backdrop-blur-sm">
                            <button
                                type="button"
                                onClick={() => setMbView("data")}
                                className={cn(
                                    "flex-1 text-[10px] font-semibold uppercase tracking-wider py-1.5 rounded-md transition-all duration-200",
                                    mbView === "data"
                                        ? "bg-white/10 text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Reference
                            </button>
                            <button
                                type="button"
                                onClick={() => setMbView("results")}
                                className={cn(
                                    "flex-1 text-[10px] font-semibold uppercase tracking-wider py-1.5 rounded-md transition-all duration-200",
                                    mbView === "results"
                                        ? "bg-white/10 text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Results ({mbReleases.length})
                            </button>
                        </div>

                        {/* Error display */}
                        {mbError && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 flex items-start gap-2">
                                <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-red-200">{mbError}</p>
                            </div>
                        )}

                        {/* Content — fixed height container so toggling doesn't shift layout */}
                        <div className="h-[460px] border border-white/[0.06] bg-white/[0.02] rounded-xl overflow-hidden backdrop-blur-sm">
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
                                                        "w-full text-left p-2.5 rounded-lg text-xs border transition-all duration-200 active:scale-[0.99]",
                                                        selectedMbRelease?.id === release.id
                                                            ? "bg-white/10 border-white/40 shadow-sm"
                                                            : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/15"
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
                                                                release.score >= 75 ? "text-white/85" :
                                                                "text-white/65"
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

                    <div className="border border-white/[0.06] rounded-xl overflow-hidden divide-y divide-white/[0.04] bg-white/[0.02] backdrop-blur-sm">
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
                                            "group w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all duration-150",
                                            isExpanded ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                                        )}
                                    >
                                        <ChevronRight
                                            className={cn(
                                                "w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
                                                isExpanded && "rotate-90"
                                            )}
                                        />
                                        <span className="text-xs font-mono text-muted-foreground w-6 shrink-0 tabular-nums">
                                            {String(index + 1).padStart(2, '0')}
                                        </span>
                                        <div className="flex-1 min-w-0 grid grid-cols-[2fr_1fr_60px] gap-3 items-center">
                                            <span className="text-sm truncate">
                                                {track.title || <span className="text-muted-foreground italic">Untitled</span>}
                                            </span>
                                            <span className="text-xs text-muted-foreground truncate">{track.artist}</span>
                                            <span className="text-xs text-muted-foreground font-mono text-right tabular-nums">
                                                {formatLength(track.length)}
                                            </span>
                                        </div>
                                        {hasDifference && (
                                            <span className="text-[10px] text-white font-semibold bg-white/10 border border-white/20 px-1.5 py-0.5 rounded-md shrink-0 flex items-center gap-0.5 transition-colors group-hover:bg-white/15">
                                                <Sparkles className="w-2.5 h-2.5" />
                                                MB
                                            </span>
                                        )}
                                    </button>

                                    {/* Expanded Edit Form */}
                                    {isExpanded && (
                                        <div className="px-4 pb-4 pt-3 bg-white/[0.02] space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
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

                <div className="mt-8 pt-6 border-t border-white/[0.06] flex justify-end">
                    <DeleteAlbumButton
                        albumId={album.id}
                        albumName={album.album}
                        isMissing={album.missing_since != null}
                    />
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
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80 flex items-center">
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
                        className="flex items-center gap-1 text-[10px] text-white/90 hover:text-white font-semibold transition-all duration-150 group shrink-0 active:scale-95"
                    >
                        <Sparkles className="w-2.5 h-2.5 transition-transform group-hover:rotate-12" />
                        <span className="max-w-[140px] truncate group-hover:underline underline-offset-2">
                            {suggestion}
                        </span>
                        <Check className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                    </button>
                )}
            </div>
            <InputComponent
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={cn(
                    "transition-all duration-150",
                    compact ? "h-8 text-sm" : "h-9",
                    multiline && "min-h-[60px] resize-none",
                    hasSuggestion && "border-white/25 focus:border-white/40"
                )}
            />
        </div>
    )
}
