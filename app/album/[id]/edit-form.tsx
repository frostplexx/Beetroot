import { Album } from "@/lib/music/database";

export default function EditAlbumForm(album: Album) {
    return (
        <div>{album.album}</div>
    )
}
