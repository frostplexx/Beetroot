"use client"

import * as React from "react"
import { Album } from "@/lib/music/database"
import AlbumArtwork from "@/components/album-artwork"
import DynamicBackground from "@/components/dynamic-background"
import { SongsDataTable } from "./data-table"
import { columns } from "./columns"
import { DeleteMissingButton } from "./delete-missing-button"
import { BackLink } from "./back-link"
import { Pencil, Eye } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EditPanel } from "./edit-panel"
import { Button } from "@/components/ui/button"

interface AlbumContentProps {
    album: Album
    artUrl: string | null
    songs: any[]
}

export function AlbumContent({ album, artUrl, songs }: AlbumContentProps) {
    const totalMinutes = album.total_time ? Math.round(album.total_time / 60) : 0
    const genres = album.genres?.split(",").map(g => g.trim()).filter(Boolean) || []
    const isMissing = album.missing_since != null
    const [activeTab, setActiveTab] = React.useState("view")
    const [isSaving, setIsSaving] = React.useState(false)

    return (
        <>
            <DynamicBackground artUrl={artUrl} />
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-screen flex flex-col">
                {/* Unified Header Bar */}
                <div className="container mx-auto px-4 pt-6 shrink-0">
                    <div className="flex items-center justify-between gap-4 mb-4 transition-all duration-200">
                        <div className="flex items-center gap-4 min-w-0">
                            <BackLink />
                            {activeTab === "edit" && (
                                <div className="flex items-center gap-2 min-w-0 animate-in fade-in slide-in-from-left-2 duration-300">
                                    <span className="text-sm text-muted-foreground">Editing</span>
                                    <span className="text-sm font-semibold truncate">{album.album}</span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <TabsList>
                                <TabsTrigger value="view" className="gap-2">
                                    <Eye className="w-4 h-4" />
                                    View
                                </TabsTrigger>
                                <TabsTrigger
                                    value="edit"
                                    className="gap-2"
                                    disabled={isMissing}
                                >
                                    <Pencil className="w-4 h-4" />
                                    Edit
                                </TabsTrigger>
                            </TabsList>
                            {activeTab === "edit" && (
                                <Button
                                    type="submit"
                                    form="album-edit-form"
                                    size="sm"
                                    disabled={isSaving}
                                    className="min-w-[120px] ml-2 transition-all duration-200 active:scale-[0.97] animate-in fade-in slide-in-from-right-2 duration-300"
                                >
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                <TabsContent value="view" className="flex-1 overflow-auto mt-0">
                    <div className="container mx-auto px-4 pb-6">
                        <div className="flex flex-col md:flex-row gap-8 items-start">
                            <AlbumArtwork
                                artUrl={artUrl}
                                album={`${album.album} by ${album.albumartist}`}
                                albumId={album.id}
                                missingSince={album.missing_since}
                            />

                            <div className="flex-1 flex flex-col justify-start gap-4">
                                <div className="flex items-start justify-between gap-4">
                                    <h1 className="font-heading text-4xl md:text-5xl font-black leading-none tracking-tight">
                                        {album.album}
                                    </h1>
                                    {album.missing_since != null && (
                                        <div className="shrink-0">
                                            <DeleteMissingButton albumId={album.id} albumName={album.album} />
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-base">
                                    <span>{album.albumartist}</span>
                                    {album.year && (
                                        <>
                                            <span className="text-white/40">•</span>
                                            <span>{album.year}</span>
                                        </>
                                    )}
                                    {album.total_tracks && (
                                        <>
                                            <span className="text-white/40">•</span>
                                            <span>{album.total_tracks} songs</span>
                                        </>
                                    )}
                                    {totalMinutes > 0 && (
                                        <>
                                            <span className="text-white/40">•</span>
                                            <span>{totalMinutes} min</span>
                                        </>
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-6">
                                    {album.country && (
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] uppercase tracking-[0.12em] text-white/50 font-medium">
                                                Country
                                            </label>
                                            <span className="text-xs font-semibold text-white/90">{album.country}</span>
                                        </div>
                                    )}
                                    {album.label && (
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] uppercase tracking-[0.12em] text-white/50 font-medium">
                                                Label
                                            </label>
                                            <span className="text-xs font-semibold text-white/90">{album.label}</span>
                                        </div>
                                    )}
                                </div>

                                {genres.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        {genres.map((genre) => (
                                            <span
                                                key={genre}
                                                className="py-1 px-3 bg-white/[0.08] border border-white/10 backdrop-blur-md rounded-full text-xs font-medium text-white/90 hover:bg-white/[0.14] hover:border-white/20 hover:text-white hover:scale-105 active:scale-95 transition-all duration-200 cursor-default"
                                            >
                                                {genre}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-12">
                            <SongsDataTable columns={columns} data={songs} totalTracks={album.total_tracks} />
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="edit" className="flex-1 overflow-hidden mt-0">
                    <EditPanel
                        album={album}
                        image={artUrl}
                        songs={songs}
                        onClose={() => setActiveTab("view")}
                        onSavingChange={setIsSaving}
                    />
                </TabsContent>
            </Tabs>
        </>
    )
}
