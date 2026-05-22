"use client"

import * as React from "react"
import { Album } from "@/lib/music/database"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Pencil } from "lucide-react"
import Image from "next/image"

interface EditDialogProps {
    album: Album
    image: string | null
}

interface AlternativeArtwork {
    source: string
    url: string
    thumbnail?: string
}

export function EditDialog({ album, image }: EditDialogProps) {
    const [open, setOpen] = React.useState(false)
    const [formData, setFormData] = React.useState({
        album: album.album,
        albumartist: album.albumartist || "",
        year: album.year || "",
        country: album.country || "",
        label: album.label || "",
        genres: album.genres || "",
        image: image || album.image || "",
    })
    const [alternatives, setAlternatives] = React.useState<AlternativeArtwork[]>([])
    const [loadingAlternatives, setLoadingAlternatives] = React.useState(false)
    const [selectedAlt, setSelectedAlt] = React.useState<string | null>(null)

    // Fetch alternatives when dialog opens
    React.useEffect(() => {
        if (open && alternatives.length === 0) {
            setLoadingAlternatives(true)
            fetch(`/api/album/${album.id}/alternatives`)
                .then(res => res.json())
                .then(data => {
                    setAlternatives(data.alternatives || [])
                })
                .catch(error => {
                    console.error('Failed to fetch alternatives:', error)
                })
                .finally(() => {
                    setLoadingAlternatives(false)
                })
        }
    }, [open, album.id, alternatives.length])

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        // TODO: Implement save functionality
        console.log("Save album:", formData)
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}  modal={false}>
            <DialogTrigger asChild>
                <button
                    className="p-2 rounded-lg bg-white/10 border border-white/20 backdrop-blur-sm hover:bg-white/20 hover:border-white/30 hover:scale-110 active:scale-95 transition-all group"
                    aria-label="Edit album"
                >
                    <Pencil className="w-4 h-4 transition-transform group-hover:rotate-12" />
                </button>
            </DialogTrigger>
            <DialogContent className="!max-w-[calc(100vw-4rem)] max-h-[calc(100vh-4rem)] overflow-y-auto">
                <DialogHeader className="pb-2">
                    <DialogTitle className="text-2xl">Edit Album</DialogTitle>
                    <DialogDescription className="text-muted-foreground/80">
                        Make changes to album metadata
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8">
                        {/* Left column: Image and carousel */}
                        <div className="flex flex-col gap-6">
                            {formData.image && (
                                <div className="relative aspect-square w-full rounded-xl overflow-hidden ring-1 ring-border/50 shadow-2xl">
                                    <Image
                                        src={formData.image}
                                        alt="Album artwork"
                                        fill
                                        className="object-cover"
                                        priority
                                    />
                                </div>
                            )}

                            {/* Alternative images carousel */}
                            <div className="flex flex-col gap-3">
                                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                    Alternative Artwork
                                </label>
                                <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory -mx-1 px-1">
                                    {loadingAlternatives ? (
                                        // Skeleton loaders
                                        Array.from({ length: 6 }).map((_, idx) => (
                                            <div
                                                key={`skeleton-${idx}`}
                                                className="relative flex-shrink-0 w-20 h-20 rounded-lg bg-muted/50 animate-pulse snap-start"
                                            />
                                        ))
                                    ) : alternatives.length > 0 ? (
                                        // Actual alternatives
                                        alternatives.map((alt, idx) => (
                                            <button
                                                key={`${alt.source}-${idx}`}
                                                type="button"
                                                className={`group relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden transition-all snap-start ${
                                                    selectedAlt === alt.url
                                                        ? 'ring-2 ring-primary shadow-lg scale-105'
                                                        : 'ring-1 ring-border/40 hover:ring-primary/60 hover:scale-105'
                                                }`}
                                                onClick={() => {
                                                    setSelectedAlt(alt.url)
                                                    setFormData({ ...formData, image: alt.url })
                                                }}
                                                title={`${alt.source}`}
                                            >
                                                <Image
                                                    src={alt.thumbnail || alt.url}
                                                    alt={`${alt.source} alternative`}
                                                    fill
                                                    className="object-cover transition-transform group-hover:scale-110"
                                                    unoptimized
                                                />
                                                {selectedAlt === alt.url && (
                                                    <div className="absolute inset-0 bg-primary/20 pointer-events-none" />
                                                )}
                                            </button>
                                        ))
                                    ) : (
                                        <p className="text-xs text-muted-foreground py-2">
                                            No alternatives found
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right column: Form fields */}
                        <div className="space-y-5">
                            <Field>
                                <FieldLabel htmlFor="album-name" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                    Album Name
                                </FieldLabel>
                                <Input
                                    id="album-name"
                                    value={formData.album}
                                    onChange={(e) =>
                                        setFormData({ ...formData, album: e.target.value })
                                    }
                                    placeholder="Album name"
                                    className="h-10"
                                />
                            </Field>

                            <Field>
                                <FieldLabel htmlFor="album-artist" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                    Artist
                                </FieldLabel>
                                <Input
                                    id="album-artist"
                                    value={formData.albumartist}
                                    onChange={(e) =>
                                        setFormData({ ...formData, albumartist: e.target.value })
                                    }
                                    placeholder="Artist name"
                                    className="h-10"
                                />
                            </Field>

                            <div className="grid grid-cols-2 gap-4">
                                <Field>
                                    <FieldLabel htmlFor="album-year" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                        Year
                                    </FieldLabel>
                                    <Input
                                        id="album-year"
                                        type="number"
                                        value={formData.year}
                                        onChange={(e) =>
                                            setFormData({ ...formData, year: e.target.value })
                                        }
                                        placeholder="2024"
                                        className="h-10"
                                    />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="album-country" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                        Country
                                    </FieldLabel>
                                    <Input
                                        id="album-country"
                                        value={formData.country}
                                        onChange={(e) =>
                                            setFormData({ ...formData, country: e.target.value })
                                        }
                                        placeholder="US"
                                        className="h-10"
                                    />
                                </Field>
                            </div>

                            <Field>
                                <FieldLabel htmlFor="album-label" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                    Label
                                </FieldLabel>
                                <Input
                                    id="album-label"
                                    value={formData.label}
                                    onChange={(e) =>
                                        setFormData({ ...formData, label: e.target.value })
                                    }
                                    placeholder="Record label"
                                    className="h-10"
                                />
                            </Field>

                            <Field>
                                <FieldLabel htmlFor="album-genres" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                    Genres
                                </FieldLabel>
                                <Textarea
                                    id="album-genres"
                                    value={formData.genres}
                                    onChange={(e) =>
                                        setFormData({ ...formData, genres: e.target.value })
                                    }
                                    placeholder="rock, alternative, indie"
                                    className="min-h-[80px] resize-none"
                                />
                                <FieldDescription className="text-xs text-muted-foreground/70 mt-1.5">
                                    Comma-separated list of genres
                                </FieldDescription>
                            </Field>
                        </div>
                    </div>

                    <DialogFooter className="pt-4 gap-3">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} className="min-w-24">
                            Cancel
                        </Button>
                        <Button type="submit" className="min-w-24">Save Changes</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
