import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { AlbumContent } from "./-album/album-content";

const loadAlbum = createServerFn({ method: "GET" })
    .inputValidator((id: string) => id)
    .handler(async ({ data: id }) => {
        const { getAlbumById, getItemsByAlbum } = await import(
            "@/lib/music/database"
        );
        const albumId = parseInt(id, 10);
        if (!Number.isFinite(albumId) || albumId <= 0) {
            return null;
        }
        const album = getAlbumById(albumId);
        // Soft-deleted albums are kept in the DB so they can be restored, but
        // should look like a 404 from the public route until restored.
        if (!album || album.marked_for_deletion != null) return null;
        const artUrl =
            album.artpath && !album.missing_since
                ? `/api/album/${albumId}/art?size=800&t=${album.added}`
                : null;
        const songs = getItemsByAlbum(albumId);
        return { album, artUrl, songs };
    });

export const Route = createFileRoute("/album/$id")({
    loader: async ({ params }) => {
        const data = await loadAlbum({ data: params.id });
        if (!data) throw notFound();
        return data;
    },
    component: AlbumPage,
    notFoundComponent: () => (
        <div className="flex items-center justify-center h-screen">
            <p className="text-white/75">Album not found</p>
        </div>
    ),
});

function AlbumPage() {
    const { album, artUrl, songs } = Route.useLoaderData();
    return <AlbumContent album={album} artUrl={artUrl} songs={songs} />;
}
