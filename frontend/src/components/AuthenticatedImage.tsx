import { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'

interface AuthenticatedImageProps {
  src: string
  alt: string
  className?: string
  loading?: 'lazy' | 'eager'
}

export const AuthenticatedImage = ({ src, alt, className, loading = 'lazy' }: AuthenticatedImageProps) => {
  const [imageSrc, setImageSrc] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const { tokens } = useAuthStore()

  useEffect(() => {
    const loadImage = async () => {
      if (!src || !tokens?.access_token) {
        setError('No authentication token')
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError('')

        // Check cache first
        const cache = await caches.open('photo-cache')
        const cachedResponse = await cache.match(src)

        if (cachedResponse) {
          const blob = await cachedResponse.blob()
          const objectUrl = URL.createObjectURL(blob)
          setImageSrc(objectUrl)
          setIsLoading(false)
          return
        }

        // Fetch from server if not in cache
        const response = await fetch(src, {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
          },
        })

        if (!response.ok) {
          throw new Error(`Failed to load image: ${response.status}`)
        }

        // Store in cache for future use
        cache.put(src, response.clone())

        // Create object URL for display
        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        setImageSrc(objectUrl)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load image')
      } finally {
        setIsLoading(false)
      }
    }

    loadImage()

    // Cleanup object URL on unmount or src change
    return () => {
      if (imageSrc) {
        URL.revokeObjectURL(imageSrc)
      }
    }
  }, [src, tokens?.access_token])

  if (isLoading) {
    return <div className={`bg-gray-200 animate-pulse ${className}`} />
  }

  if (error) {
    return <div className={`bg-red-100 text-red-500 text-sm p-2 ${className}`}>Error: {error}</div>
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      loading={loading}
    />
  )
}
