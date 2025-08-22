import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Loader2, ImageOff, AlertCircle } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { PhotoModal } from '../components/PhotoModal'
import { ThemeSwitch } from '../components/ThemeSwitch'
import { shareLinkService } from '../services/shareLinkService'

interface PublicPhoto {
  photo_id: string
  thumbnail_url: string
  full_url: string
}

interface PublicGalleryData {
  photos: PublicPhoto[]
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
      <div className="min-h-screen bg-gradient-to-br from-gray-100 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-blue-900 dark:to-purple-900">
        <div className="container mx-auto px-4 py-16">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="flex items-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-600 dark:text-gray-400" />
              <span className="ml-3 text-lg text-gray-700 dark:text-gray-300">Loading gallery...</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-100 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-blue-900 dark:to-purple-900">
        <div className="container mx-auto px-4 py-16">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <AlertCircle className="w-16 h-16 text-red-500 dark:text-red-400 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Gallery Not Available</h1>
              <p className="text-gray-600 dark:text-gray-400">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br from-gray-100 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-blue-900 dark:to-purple-900 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
      {/* Theme switch button */}
      <ThemeSwitch />
  <div className="w-full px-4 sm:px-6 lg:px-10 py-16">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Shared Gallery</h1>
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              You're viewing a gallery shared with you
            </p>
          </div>

          {/* Gallery Actions */}
          {gallery && gallery.photos.length > 0 && (
            <div className="mb-8 text-center">
              <button
                onClick={handleDownloadAll}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors inline-flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download All Photos
              </button>
            </div>
          )}

          {/* Photos Grid */}
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                Photos ({gallery?.photos.length || 0})
              </h2>
            </div>

            {gallery && gallery.photos.length > 0 ? (
              <div className="columns-1 sm:columns-2 md:columns-2 lg:columns-3 xl:columns-3 2xl:columns-3 gap-6">
                {gallery.photos.map((photo, index) => (
                  <div key={photo.photo_id} className="break-inside-avoid mb-6 relative group">
                    <button
                      onClick={() => openPhoto(index)}
                      className="w-full p-0 border-0 bg-transparent cursor-pointer"
                    >
                      <img
                        src={`http://localhost:8000${photo.full_url}`}
                        alt={`Photo ${photo.photo_id}`}
                        className="block w-full h-auto rounded-lg hover:opacity-90 transition-opacity"
                        loading="lazy"
                      />
                    </button>
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none rounded-lg">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDownloadPhoto(photo.photo_id)
                        }}
                        className="flex items-center justify-center w-10 h-10 p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors pointer-events-auto"
                        title="Download Photo"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                <ImageOff className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
                <h3 className="mt-4 text-lg font-medium text-gray-600 dark:text-gray-300">No photos in this gallery</h3>
                <p className="mt-2 text-sm text-gray-500">This gallery appears to be empty.</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="text-center mt-12 text-gray-600 dark:text-gray-400 text-sm">
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
          />
        </div>
      </div>
  )
}
