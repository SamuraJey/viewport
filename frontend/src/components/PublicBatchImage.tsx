import { useEffect, useState, useRef, createContext, useContext } from 'react'
import { shareLinkService } from '../services/shareLinkService'

interface PublicBatchImageProps {
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

interface BatchCacheData {
    urls: Map<string, CachedUrl>
    loadingPromise: Promise<void> | null
    lastFetch: number
}

// Cache for batch presigned URLs per shareId
const batchCache = new Map<string, BatchCacheData>()

const CACHE_BUFFER_MS = 5 * 60 * 1000 // 5 minutes buffer before expiration
const BATCH_CACHE_TTL = 30 * 60 * 1000 // 30 minutes cache TTL for batch data

// Context to share batch loading state across images in the same gallery
interface BatchContextValue {
    shareId: string
    loadBatch: () => Promise<void>
}

const BatchContext = createContext<BatchContextValue | null>(null)

export const PublicBatchImageProvider = ({ shareId, children }: { shareId: string; children: React.ReactNode }) => {
    const loadBatch = async () => {
        const now = Date.now()

        // Check if we have recent batch cache
        const cached = batchCache.get(shareId)
        if (cached && cached.lastFetch > now - BATCH_CACHE_TTL) {
            return
        }

        // If already loading, wait for existing promise
        if (cached?.loadingPromise) {
            await cached.loadingPromise
            return
        }

        // Create new loading promise
        const loadingPromise = (async () => {
            try {
                const photos = await shareLinkService.getAllPublicPhotoUrls(shareId)

                const urls = new Map<string, CachedUrl>()
                const expiresAt = now + BATCH_CACHE_TTL - CACHE_BUFFER_MS

                photos.forEach(photo => {
                    urls.set(photo.photo_id, {
                        url: photo.full_url,
                        expiresAt
                    })
                })

                batchCache.set(shareId, {
                    urls,
                    loadingPromise: null,
                    lastFetch: now
                })
            } catch (error) {
                console.error('Failed to load batch photo URLs:', error)
                // Clear loading promise on error
                const cached = batchCache.get(shareId)
                if (cached) {
                    cached.loadingPromise = null
                }
            }
        })()

        // Store loading promise
        if (!batchCache.has(shareId)) {
            batchCache.set(shareId, {
                urls: new Map(),
                loadingPromise,
                lastFetch: 0
            })
        } else {
            batchCache.get(shareId)!.loadingPromise = loadingPromise
        }

        await loadingPromise
    }

    return (
        <BatchContext.Provider value={{ shareId, loadBatch }}>
            {children}
        </BatchContext.Provider>
    )
}

export const PublicBatchImage = ({
    shareId,
    photoId,
    alt,
    className,
    loading = 'lazy'
}: PublicBatchImageProps) => {
    const [imageSrc, setImageSrc] = useState<string>('')
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string>('')
    const abortControllerRef = useRef<AbortController | null>(null)

    const batchContext = useContext(BatchContext)

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
                const now = Date.now()

                // Check individual photo cache first
                const cached = batchCache.get(shareId)
                const cachedPhoto = cached?.urls.get(photoId)

                if (cachedPhoto && cachedPhoto.expiresAt > now + CACHE_BUFFER_MS) {
                    setImageSrc(cachedPhoto.url)
                    setIsLoading(false)
                    return
                }

                // Use batch context if available, otherwise load individually
                if (batchContext && batchContext.shareId === shareId) {
                    await batchContext.loadBatch()

                    // Check cache again after batch load
                    const updatedCache = batchCache.get(shareId)
                    const updatedPhoto = updatedCache?.urls.get(photoId)

                    if (updatedPhoto && updatedPhoto.expiresAt > now + CACHE_BUFFER_MS) {
                        setImageSrc(updatedPhoto.url)
                        setIsLoading(false)
                        return
                    }
                }

                // Fallback to individual photo URL request
                const response = await shareLinkService.getPublicPhotoUrl(shareId, photoId)

                // Check if request was aborted
                if (abortControllerRef.current?.signal.aborted) {
                    return
                }

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
    }, [shareId, photoId, batchContext])

    if (isLoading) {
        return (
            <div className={`bg-gray-200 dark:bg-gray-700 animate-pulse flex items-center justify-center ${className}`}>
                <div className="text-gray-500 text-sm">Loading...</div>
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
