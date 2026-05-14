import { AlbumCard } from './AlbumCard'

export function AlbumGrid({ albums }) {
  return (
    <div>
      {albums.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-neutral-500">No albums found</p>
        </div>
      ) : (
        <div
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4"
          style={{
            contentVisibility: 'auto',
            containIntrinsicSize: 'auto 300px'
          }}
        >
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      )}
    </div>
  )
}
