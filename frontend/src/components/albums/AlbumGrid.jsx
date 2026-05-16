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
          className="grid gap-4"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 280px))',
            contentVisibility: 'auto',
            containIntrinsicSize: 'auto 300px',
            justifyContent: 'center'
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
