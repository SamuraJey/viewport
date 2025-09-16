import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Loader2, ImageOff, AlertCircle } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { PhotoModal } from '../components/PhotoModal'
import { PublicPresignedImage } from '../components/PublicImage'
import { PublicBatchImage, PublicBatchImageProvider } from '../components/PublicBatchImage'
import { ThemeSwitch } from '../components/ThemeSwitch'
import { shareLinkService } from '../services/shareLinkService'

interface PublicPhoto {
  photo_id: string
  thumbnail_url: string
  full_url: string
}

interface PublicGalleryData {
  photos: PublicPhoto[]
  cover?: { photo_id: string; full_url: string; thumbnail_url: string } | null
  photographer?: string
  gallery_name?: string
  date?: string
  site_url?: string
}

export const PublicGalleryPage = () => {
  const { shareId } = useParams<{ shareId: string }>()
  const [gallery, setGallery] = useState<PublicGalleryData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null)
  const { theme } = useTheme()

  useEffect(() => {
    const fetchGallery = async () => {
      if (!shareId) {
        setError('Invalid share link')
        setIsLoading(false)
        return
      }

      try {
        const data = await shareLinkService.getSharedGallery(shareId)
        setGallery(data)
      } catch (err) {
        console.error('Failed to fetch shared gallery:', err)
        setError('Gallery not found or link has expired')
      } finally {
        setIsLoading(false)
      }
    }

    fetchGallery()
  }, [shareId])

  const handleDownloadAll = () => {
    if (!shareId) return
    window.open(`http://localhost:8000/s/${shareId}/download/all`, '_blank')
  }

  const handleDownloadPhoto = (photoId: string) => {
    if (!shareId) return
    window.open(`http://localhost:8000/s/${shareId}/download/${photoId}`, '_blank')
  }

  // Photo modal handlers
  const openPhoto = (index: number) => {
    setSelectedPhotoIndex(index)
  }

  const closePhoto = () => {
    setSelectedPhotoIndex(null)
  }

  const goToPrevPhoto = () => {
    if (selectedPhotoIndex !== null && gallery?.photos) {
      const newIndex = selectedPhotoIndex > 0 ? selectedPhotoIndex - 1 : gallery.photos.length - 1
      setSelectedPhotoIndex(newIndex)
    }
  }

  const goToNextPhoto = () => {
    if (selectedPhotoIndex !== null && gallery?.photos) {
      const newIndex = selectedPhotoIndex < gallery.photos.length - 1 ? selectedPhotoIndex + 1 : 0
      setSelectedPhotoIndex(newIndex)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface dark:bg-surface-foreground/5">
        <div className="container mx-auto px-4 py-16">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="flex items-center">
              <Loader2 className="w-8 h-8 animate-spin text-text-muted" />
              <span className="ml-3 text-lg text-text-muted">Loading gallery...</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-surface dark:bg-surface-foreground/5">
        <div className="container mx-auto px-4 py-16">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <AlertCircle className="w-16 h-16 text-danger mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-text dark:text-accent-foreground mb-2">Gallery Not Available</h1>
              <p className="text-muted dark:text-text">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen bg-surface dark:bg-surface-foreground/5 ${theme === 'dark' ? 'text-accent-foreground' : 'text-text'}`}>
      {/* Theme switch button */}
      <div className="fixed top-6 right-6 z-30">
        <ThemeSwitch />
      </div>
      {/* Hero Section */}
      {gallery?.cover ? (
        <div className="pg-hero relative w-full text-accent-foreground">
          {/* Background Image */}
          <PublicPresignedImage
            shareId={shareId!}
            photoId={gallery.cover.photo_id}
            alt="Gallery cover"
            className="absolute inset-0 w-full h-full object-cover"
            loading="eager"
          />
          {/* Overlay */}
          <div className="pg-hero__overlay" />

          {/* Centered Content */}
          <div className="relative z-10 p-6">
            {gallery.date && (
              <p className="text-sm pg-hero__meta mb-2">{gallery.date}</p>
            )}
            <h1 className="pg-hero__title font-bold drop-shadow-lg">
              {gallery.gallery_name || 'Shared Gallery'}
            </h1>
            <div className="mt-4 text-lg pg-hero__meta">
              {gallery.photographer && <span>{gallery.photographer}</span>}
              {gallery.photographer && gallery.site_url && <span className="mx-2">|</span>}
              {gallery.site_url && (
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-accent-foreground"
                  href={gallery.site_url}
                >
                  {new URL(gallery.site_url).host}
                </a>
              )}
            </div>
          </div>

          {/* Scroll Down Arrow */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
            <a
              href="#gallery-content"
              aria-label="Scroll to photos"
              className="w-10 h-10 border-2 border-white/70 rounded-full flex items-center justify-center animate-bounce"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('gallery-content')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </a>
          </div>
        </div>
      ) : (
        // Fallback for no cover photo
        <div className="text-center py-16">
          <h1 className="text-4xl font-bold text-text dark:text-accent-foreground mb-2">{gallery?.gallery_name || 'Shared Gallery'}</h1>
          {gallery?.photographer && (
            <p className="text-muted dark:text-text text-lg">By {gallery.photographer}</p>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <div id="gallery-content" className="w-full px-4 sm:px-6 lg:px-10 py-16">
        {/* Gallery Actions */}
        {gallery && gallery.photos.length > 0 && (
          <div className="mb-8 text-center">
            <button
              onClick={handleDownloadAll}
              className="bg-accent hover:bg-accent/90 text-accent-foreground px-6 py-3 rounded-lg font-medium transition-colors inline-flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              Download All Photos
            </button>
          </div>
        )}

        {/* Photos Grid */}
        <div className="bg-surface-foreground/5 backdrop-blur-sm rounded-2xl p-6 border border-border">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-text dark:text-accent-foreground mb-2">
              Photos ({gallery?.photos.length || 0})
            </h2>
          </div>

          {gallery && gallery.photos.length > 0 ? (
            <PublicBatchImageProvider shareId={shareId!}>
              <div className="pg-columns">
                {gallery.photos.map((photo, index) => (
                  <div key={photo.photo_id} className="pg-card relative group">
                    <button
                      onClick={() => openPhoto(index)}
                      className="w-full p-0 border-0 bg-transparent cursor-pointer block"
                      aria-label={`Photo ${photo.photo_id}`}
                    >
                      <PublicBatchImage
                        shareId={shareId!}
                        photoId={photo.photo_id}
                        alt={`Photo ${photo.photo_id}`}
                        className="block w-full h-auto object-cover"
                        loading="lazy"
                      />
                    </button>
                    <div className="absolute inset-0 bg-photo-overlay opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDownloadPhoto(photo.photo_id)
                        }}
                        className="flex items-center justify-center w-10 h-10 p-2 bg-surface-foreground/20 hover:bg-surface-foreground/30 text-accent-foreground rounded-full transition-colors pointer-events-auto pg-download-btn"
                        title="Download Photo"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </PublicBatchImageProvider>
          ) : (
            <div className="text-center py-16 border-2 border-dashed border-border dark:border-border/10 rounded-lg">
              <ImageOff className="mx-auto h-12 w-12 text-muted" />
              <h3 className="mt-4 text-lg font-medium text-muted dark:text-muted-foreground">No photos in this gallery</h3>
              <p className="mt-2 text-sm text-muted">This gallery appears to be empty.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-muted dark:text-text text-sm">
          <p>Powered by Viewport - Your Photo Gallery Solution</p>
        </div>

        {/* Photo Modal */}
        <PhotoModal
          photos={gallery?.photos || []}
          selectedIndex={selectedPhotoIndex}
          onClose={closePhoto}
          onPrevious={goToPrevPhoto}
          onNext={goToNextPhoto}
          onDownload={handleDownloadPhoto}
          isPublic={true}
          shareId={shareId}
        />
      </div>
    </div>
  )
}
