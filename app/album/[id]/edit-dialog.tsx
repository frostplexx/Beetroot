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

    const handleSubmit = (e: React.FormEvent) => {
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
            <DialogContent className="!max-w-[calc(100vw-4rem)]">
                <DialogHeader>
                    <DialogTitle>Edit Album</DialogTitle>
                    <DialogDescription>
                        Make changes to album metadata. Click save when you're done.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6">
                        {/* Left column: Image and carousel */}
                        <div className="flex flex-col gap-4">
                            {formData.image && (
                                <div className="relative aspect-square w-full">
                                    <Image
                                        src={formData.image}
                                        alt="Album artwork"
                                        fill
                                        className="rounded-lg shadow-lg object-cover"
                                    />
                                </div>
                            )}

                            {/* Alternative images carousel */}
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-medium text-muted-foreground">
                                    Alternative Artwork
                                </label>
                                <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory">
                                    {loadingAlternatives ? (
                                        // Skeleton loaders
                                        Array.from({ length: 6 }).map((_, idx) => (
                                            <div
                                                key={`skeleton-${idx}`}
                                                className="relative flex-shrink-0 w-16 h-16 rounded bg-white/10 animate-pulse snap-start"
                                            />
                                        ))
                                    ) : alternatives.length > 0 ? (
                                        // Actual alternatives
                                        alternatives.map((alt, idx) => (
                                            <button
                                                key={`${alt.source}-${idx}`}
                                                type="button"
                                                className={`relative flex-shrink-0 w-16 h-16 rounded border-2 transition-all snap-start ${
                                                    selectedAlt === alt.url
                                                        ? 'border-primary ring-2 ring-primary/50'
                                                        : 'border-transparent hover:border-primary/50'
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
                                                    className="rounded object-cover"
                                                    unoptimized
                                                />
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
                        <FieldGroup>
                        <Field>
                            <FieldLabel htmlFor="album-name">Album Name</FieldLabel>
                            <Input
                                id="album-name"
                                value={formData.album}
                                onChange={(e) =>
                                    setFormData({ ...formData, album: e.target.value })
                                }
                                placeholder="Album name"
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="album-artist">Artist</FieldLabel>
                            <Input
                                id="album-artist"
                                value={formData.albumartist}
                                onChange={(e) =>
                                    setFormData({ ...formData, albumartist: e.target.value })
                                }
                                placeholder="Artist name"
                            />
                        </Field>
                        <div className="grid grid-cols-2 gap-4">
                            <Field>
                                <FieldLabel htmlFor="album-year">Year</FieldLabel>
                                <Input
                                    id="album-year"
                                    type="number"
                                    value={formData.year}
                                    onChange={(e) =>
                                        setFormData({ ...formData, year: e.target.value })
                                    }
                                    placeholder="2024"
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="album-country">Country</FieldLabel>
                                <Input
                                    id="album-country"
                                    value={formData.country}
                                    onChange={(e) =>
                                        setFormData({ ...formData, country: e.target.value })
                                    }
                                    placeholder="US"
                                />
                            </Field>
                        </div>
                        <Field>
                            <FieldLabel htmlFor="album-label">Label</FieldLabel>
                            <Input
                                id="album-label"
                                value={formData.label}
                                onChange={(e) =>
                                    setFormData({ ...formData, label: e.target.value })
                                }
                                placeholder="Record label"
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="album-genres">Genres</FieldLabel>
                            <Textarea
                                id="album-genres"
                                value={formData.genres}
                                onChange={(e) =>
                                    setFormData({ ...formData, genres: e.target.value })
                                }
                                placeholder="rock, alternative, indie"
                                className="min-h-[80px]"
                            />
                            <FieldDescription>
                                Comma-separated list of genres
                            </FieldDescription>
                        </Field>
                    </FieldGroup>
                    </div>

                    <DialogFooter className="mt-6">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit">Save Changes</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
