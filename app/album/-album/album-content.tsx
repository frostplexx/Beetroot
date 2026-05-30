import * as React from "react"
import { Album } from "@/lib/music/database"
import AlbumArtwork from "@/components/album-artwork"
import DynamicBackground from "@/components/dynamic-background"
import { SongsDataTable } from "./data-table"
import { columns } from "./columns"
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
        <div className="md:absolute md:inset-0 md:overflow-hidden">
            <DynamicBackground artUrl={artUrl} />
            <Tabs value={activeTab} onValueChange={setActiveTab} className="md:h-full flex flex-col">
                {/* Unified Header Bar */}
                <div className="container mx-auto px-4 pt-2 shrink-0">
                    <div className="flex items-center justify-between mb-2 transition-all duration-200">
                        <div className="flex items-center gap-4 min-w-0">
                            <BackLink />
                            {activeTab === "edit" && (
                                <div className="hidden sm:flex items-center gap-2 min-w-0 animate-in fade-in slide-in-from-left-2 duration-300">
                                    <span className="text-sm text-muted-foreground">Editing</span>
                                    <span className="text-sm font-semibold truncate">{album.album}</span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center  shrink-0">
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

                <TabsContent value="view" className="md:flex-1 flex flex-col md:overflow-hidden mt-0">
                    <div className="container mx-auto px-4 pb-4 shrink-0">
                        <div className="flex flex-col md:flex-row  gap-8 md:items-start items-center">
                            <AlbumArtwork
                                artUrl={artUrl}
                                album={`${album.album} by ${album.albumartist}`}
                                albumId={album.id}
                                missingSince={album.missing_since}
                            />

                            <div className="flex-1 flex flex-col md:justify-start justify-center gap-4">
                                <div className="flex md:items-start items-center justify-center md:justify-start gap-4">
                                    <h1 className="font-heading text-4xl md:text-5xl font-black md:text-start text-center leading-none tracking-tight">
                                        {album.album}
                                    </h1>
                                </div>

                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-base w-full text-center md:text-left justify-center md:justify-start text-white/75">
                                    <span>{album.albumartist}</span>
                                    {album.year && (
                                        <>
                                            <span className="text-white/55">•</span>
                                            <span>{album.year}</span>
                                        </>
                                    )}
                                    {album.total_tracks && (
                                        <>
                                            <span className="text-white/55">•</span>
                                            <span>{album.total_tracks} songs</span>
                                        </>
                                    )}
                                    {totalMinutes > 0 && (
                                        <>
                                            <span className="text-white/55">•</span>
                                            <span>{totalMinutes} min</span>
                                        </>
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-6 md:mt-0 mt-2">
                                    {album.country && (
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] uppercase tracking-[0.14em] text-white/55 font-medium">
                                                Country
                                            </label>
                                            <span className="text-xs font-semibold text-white/90">{album.country}</span>
                                        </div>
                                    )}
                                    {album.label && (
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] uppercase tracking-[0.14em] text-white/55 font-medium">
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
                                                className="py-1 px-3 bg-white/[0.05] border border-white/[0.08] backdrop-blur-md rounded-full text-xs font-medium text-white/85 hover:bg-white/[0.10] hover:border-white/[0.15] hover:text-white hover:scale-105 active:scale-95 transition-all duration-200 cursor-default"
                                            >
                                                {genre}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="md:flex-1 md:min-h-0 flex flex-col container mx-auto px-4 pb-6">
                        <SongsDataTable columns={columns} data={songs} />
                    </div>
                </TabsContent>

                <TabsContent value="edit" className="md:flex-1 md:overflow-hidden mt-0">
                    <EditPanel
                        album={album}
                        image={artUrl}
                        songs={songs}
                        onClose={() => setActiveTab("view")}
                        onSavingChange={setIsSaving}
                    />
                </TabsContent>
            </Tabs>
        </div>
    )
}
