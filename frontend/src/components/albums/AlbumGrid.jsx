import { AlbumCard } from './AlbumCard'

export function AlbumGrid({ albums }) {
  return (
    <div>
      {albums.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-neutral-500">No albums found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      )}
    </div>
  )
}
