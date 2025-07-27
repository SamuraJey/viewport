import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

interface AuthenticatedImageProps {
  src: string
  alt: string
  className?: string
  loading?: 'lazy' | 'eager'
}

export const AuthenticatedImage = ({ src, alt, className, loading = 'lazy' }: AuthenticatedImageProps) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const blobUrlRef = useRef<string | null>(null)

  useEffect(() => {
    let isCancelled = false

    const loadImage = async () => {
      if (!src) return

      try {
        setIsLoading(true)
        setError(false)
        setImageSrc(null)

        // Clean up previous blob URL if it exists
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current)
          blobUrlRef.current = null
        }

        // Fetch the image with authentication headers
        const response = await api.get(src, {
          responseType: 'blob'
        })

        if (isCancelled) return

        // Create blob URL for the image
        const blob = new Blob([response.data])
        const blobUrl = URL.createObjectURL(blob)
        blobUrlRef.current = blobUrl
        setImageSrc(blobUrl)
      } catch (err) {
        console.error('Failed to load authenticated image:', err)
        if (!isCancelled) {
          setError(true)
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    loadImage()

    // Cleanup function
    return () => {
      isCancelled = true
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [src])

  // Cleanup blob URL when component unmounts
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
      }
    }
  }, [])

  if (isLoading) {
    return (
      <div className={`bg-gray-800 animate-pulse ${className}`}>
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-gray-500 text-sm">Loading...</div>
        </div>
      </div>
    )
  }

  if (error || !imageSrc) {
    return (
      <div className={`bg-gray-800 ${className}`}>
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-gray-500 text-sm">Failed to load</div>
        </div>
      </div>
    )
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
