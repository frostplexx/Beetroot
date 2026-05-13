import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function AlbumCard({ album }) {
  const navigate = useNavigate()
  const [imageError, setImageError] = useState(false)

  return (
    <div className="group cursor-pointer" onClick={() => navigate(`/album/${album.id}`)}>
      <div className="aspect-square bg-neutral-900 border border-neutral-900 rounded mb-2 flex items-center justify-center overflow-hidden relative">
        {!imageError ? (
          <img
            src={`/api/beets/albums/${album.id}/art`}
            alt={album.album}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <svg className="w-12 h-12 text-neutral-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
            />
          </svg>
        )}
      </div>
      <div>
        <div className="text-sm text-neutral-200 truncate group-hover:text-rose-500 transition-colors">
          {album.album}
        </div>
        <div className="text-xs text-neutral-500 truncate">{album.albumartist}</div>
        {album.year && album.year.Valid && (
          <div className="text-xs text-neutral-600 mt-1">{album.year.Int64}</div>
        )}
      </div>
    </div>
  )
}
