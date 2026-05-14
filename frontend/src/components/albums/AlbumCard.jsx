import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function AlbumCard({ album, index = 0 }) {
  const navigate = useNavigate()
  const [imageError, setImageError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  return (
    <div
      className="group cursor-pointer aspect-square bg-neutral-900 border border-neutral-900 rounded-xl overflow-hidden relative transition-all duration-150 hover:border-rose-500/50 hover:shadow-xl hover:shadow-rose-500/10 hover:-translate-y-0.5 active:scale-[0.99] opacity-0 animate-fade-in"
      style={{
        animationDelay: `${index * 20}ms`,
        animationFillMode: 'forwards'
      }}
      onClick={() => navigate(`/album/${album.id}`)}
    >
      {/* Album Art with zoom effect */}
      <div className="absolute inset-0 overflow-hidden">
        {!imageError ? (
          <img
            src={`/api/beets/albums/${album.id}/art?size=400`}
            alt={album.album}
            loading="lazy"
            decoding="async"
            className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onError={() => setImageError(true)}
            onLoad={() => setImageLoaded(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-12 h-12 text-neutral-800 transition-transform duration-200 group-hover:scale-105" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>
        )}

        {/* Shimmer loading effect */}
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 animate-shimmer" />
        )}
      </div>

      {/* Gradient Blur Overlay at Bottom */}
      <div
        className="absolute inset-x-0 bottom-0 h-20 transition-all duration-200 group-hover:h-22"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          maskImage: 'linear-gradient(to top, black 0%, black 40%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to top, black 0%, black 40%, transparent 100%)'
        }}
      >
        <div className="absolute inset-x-0 bottom-0 p-3 transform transition-all duration-200 group-hover:translate-y-[-2px]">
          <div className="text-sm font-medium text-white truncate group-hover:text-rose-400 transition-all duration-200">
            {album.album}
          </div>
          <div className="text-xs text-neutral-300 truncate mt-0.5 transition-all duration-200 group-hover:text-neutral-200">
            {album.albumartist}
          </div>
        </div>
      </div>
    </div>
  )
}
