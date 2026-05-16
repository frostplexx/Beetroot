import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

/**
 * Custom hook to fetch and cache album artwork using React Query
 * @param {number} albumId - The album ID
 * @param {number} size - Image size (default 400)
 * @param {number} timestamp - Optional timestamp for cache busting when art is refetched
 * @returns {Object} { imageUrl, isLoading, error }
 */
export function useAlbumArt(albumId, size = 400, timestamp = null) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['albumArt', albumId, size, timestamp],
    queryFn: async () => {
      const url = `/api/beets/albums/${albumId}/art?size=${size}${timestamp ? `&t=${timestamp}` : ''}`
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Failed to load album art')
      }
      const blob = await response.blob()
      // Create object URL from blob
      return URL.createObjectURL(blob)
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000,     // 30 minutes
    retry: 1,
  })

  // Cleanup object URL when component unmounts or data changes
  useEffect(() => {
    return () => {
      if (data) {
        URL.revokeObjectURL(data)
      }
    }
  }, [data])

  return {
    imageUrl: data,
    isLoading,
    error
  }
}
