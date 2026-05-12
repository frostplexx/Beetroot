import { AlbumCard } from './AlbumCard'
import { Pagination } from '../common/Pagination'

export function AlbumGrid({ albums, currentPage, totalAlbums, albumsPerPage, onPageChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
          Albums (Showing {albums.length} of {totalAlbums})
        </h2>
        <Pagination
          currentPage={currentPage}
          totalItems={totalAlbums}
          itemsPerPage={albumsPerPage}
          onPageChange={onPageChange}
        />
      </div>
      {albums.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-neutral-500">No albums found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      )}
    </div>
  )
}
