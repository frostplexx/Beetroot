import { useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'

export const AlbumCard = memo(function AlbumCard({ album, index = 0 }) {
  const navigate = useNavigate()
  const [imageError, setImageError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  return (
    <div
      className="group cursor-pointer aspect-square bg-neutral-900 border border-neutral-900 rounded-xl overflow-hidden relative transition-[border-color,box-shadow] duration-150 hover:border-rose-500/50 hover:shadow-lg hover:shadow-rose-500/5 active:scale-[0.99]"
      style={{ willChange: 'border-color' }}
      onClick={() => navigate(`/album/${album.id}`)}
    >
      {/* Album Art */}
      <div className="absolute inset-0 overflow-hidden">
        {!imageError ? (
          <img
            src={`/api/beets/albums/${album.id}/art?size=400`}
            alt={album.album}
            loading="lazy"
            decoding="async"
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onError={() => setImageError(true)}
            onLoad={() => setImageLoaded(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-12 h-12 text-neutral-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>
        )}

        {/* Loading placeholder */}
        {!imageLoaded && !imageError && (
          <Skeleton className="absolute inset-0" />
        )}
      </div>

      {/* Simple gradient overlay - no blur, no animations */}
      <div
        className="absolute inset-x-0 bottom-0 h-20 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)'
        }}
      >
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="text-sm font-medium text-white truncate group-hover:text-rose-400 transition-colors duration-150">
            {album.album}
          </div>
          <div className="text-xs text-neutral-300 truncate mt-0.5">
            {album.albumartist}
          </div>
        </div>
      </div>
    </div>
  )
})
