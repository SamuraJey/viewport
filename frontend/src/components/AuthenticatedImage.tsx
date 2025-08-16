import { useEffect, useState } from 'react'
import { api } from '../lib/api'

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

  useEffect(() => {
    let activeUrl: string | null = null
    const loadImage = async () => {
      if (!src) {
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      setError('')
      try {
        const response = await api.get(src, { responseType: 'blob' })
        const blob = response.data
        const objectUrl = URL.createObjectURL(blob)
        activeUrl = objectUrl
        setImageSrc(objectUrl)
      } catch (err: any) {
        console.error('Failed to load authenticated image:', err)
        setError('Failed to load')
      } finally {
        setIsLoading(false)
      }
    }

    loadImage()
    return () => {
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl)
      }
    }
  }, [src])

  if (isLoading) {
    return (
      <div className={`bg-gray-800 animate-pulse ${className}`}>
        <div>
          <div>Loading...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`bg-red-100 text-red-500 text-sm p-2 ${className}`}>{error}</div>
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
