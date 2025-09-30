import { useEffect, useState, useRef } from 'react'
import { shareLinkService } from '../services/shareLinkService'

interface PublicPresignedImageProps {
    shareId: string
    photoId: string
    alt: string
    className?: string
    loading?: 'lazy' | 'eager'
}

interface CachedUrl {
    url: string
    expiresAt: number
}

// Cache for presigned URLs
const urlCache = new Map<string, CachedUrl>()

const CACHE_BUFFER_MS = 5 * 60 * 1000 // 5 minutes buffer before expiration

export const PublicPresignedImage = ({
    shareId,
    photoId,
    alt,
    className,
    loading = 'lazy'
}: PublicPresignedImageProps) => {
    const [imageSrc, setImageSrc] = useState<string>('')
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string>('')
    const abortControllerRef = useRef<AbortController | null>(null)

    useEffect(() => {
        const loadImage = async () => {
            // Abort previous request if it exists
            if (abortControllerRef.current) {
                abortControllerRef.current.abort()
            }

            abortControllerRef.current = new AbortController()

            if (!shareId || !photoId) {
                setIsLoading(false)
                return
            }

            setIsLoading(true)
            setError('')

            try {
                const cacheKey = `${shareId}-${photoId}`
                const now = Date.now()

                // Check cache first
                const cached = urlCache.get(cacheKey)
                if (cached && cached.expiresAt > now + CACHE_BUFFER_MS) {
                    setImageSrc(cached.url)
                    setIsLoading(false)
                    return
                }

                // Fetch new presigned URL
                const response = await shareLinkService.getPublicPhotoUrl(shareId, photoId)

                // Check if request was aborted
                if (abortControllerRef.current?.signal.aborted) {
                    return
                }

                // Cache the URL with expiration time
                const expiresAt = now + (response.expires_in * 1000) - CACHE_BUFFER_MS
                urlCache.set(cacheKey, {
                    url: response.url,
                    expiresAt
                })

                setImageSrc(response.url)
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.error('Failed to load presigned image URL:', err)
                    setError('Failed to load')
                }
            } finally {
                if (!abortControllerRef.current?.signal.aborted) {
                    setIsLoading(false)
                }
            }
        }

        loadImage()

        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort()
            }
        }
    }, [shareId, photoId])

    if (isLoading) {
        return (
            <div className={`bg-surface-foreground dark:bg-surface animate-pulse flex items-center justify-center ${className}`}>
                <div className="text-text-muted text-sm">Loading...</div>
            </div>
        )
    }

    if (error) {
        return (
            <div className={`bg-red-100 text-red-500 text-sm p-2 flex items-center justify-center ${className}`}>
                {error}
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
