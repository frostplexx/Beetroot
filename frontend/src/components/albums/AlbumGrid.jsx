import { AlbumCard } from './AlbumCard'

export function AlbumGrid({ albums }) {
  return (
    <div>
      {albums.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-neutral-500">No albums found</p>
        </div>
      ) : (
        <div className="grid gap-2 md:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      )}
    </div>
  )
}
