import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Loader2, ImageOff, AlertCircle, X, ChevronLeft, ChevronRight } from 'lucide-react'
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

  // Keyboard navigation
  const handleKeyDown = (e: Event) => {
    const keyboardEvent = e as KeyboardEvent
    if (selectedPhotoIndex === null) return
    
    switch (keyboardEvent.key) {
      case 'Escape':
        closePhoto()
        break
      case 'ArrowLeft':
        goToPrevPhoto()
        break
      case 'ArrowRight':
        goToNextPhoto()
        break
    }
  }

  // Add keyboard event listener
  useEffect(() => {
    if (selectedPhotoIndex !== null) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedPhotoIndex, gallery?.photos])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
        <div className="container mx-auto px-4 py-16">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="flex items-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              <span className="ml-3 text-lg text-gray-300">Loading gallery...</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
        <div className="container mx-auto px-4 py-16">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-white mb-2">Gallery Not Available</h1>
              <p className="text-gray-400">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-white mb-4">Shared Gallery</h1>
            <p className="text-gray-400 text-lg">
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
              <h2 className="text-2xl font-semibold text-white mb-2">
                Photos ({gallery?.photos.length || 0})
              </h2>
            </div>

            {gallery && gallery.photos.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {gallery.photos.map((photo, index) => (
                  <div key={photo.photo_id} className="relative group aspect-square">
                    <button
                      onClick={() => openPhoto(index)}
                      className="w-full h-full p-0 border-0 bg-transparent cursor-pointer"
                    >
                      <img
                        src={`http://localhost:8000${photo.full_url}`}
                        alt={`Photo ${photo.photo_id}`}
                        className="w-full h-full object-cover rounded-lg hover:opacity-90 transition-opacity"
                        loading="lazy"
                      />
                    </button>
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
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
              <div className="text-center py-16 border-2 border-dashed border-gray-600 rounded-lg">
                <ImageOff className="mx-auto h-12 w-12 text-gray-500" />
                <h3 className="mt-4 text-lg font-medium text-gray-300">No photos in this gallery</h3>
                <p className="mt-2 text-sm text-gray-500">This gallery appears to be empty.</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="text-center mt-12 text-gray-400 text-sm">
            <p>Powered by Viewport - Your Photo Gallery Solution</p>
          </div>
        </div>

        {/* Photo Modal */}
        {selectedPhotoIndex !== null && gallery?.photos && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
            {/* Close button */}
            <button
              onClick={closePhoto}
              className="absolute top-4 right-4 z-10 flex items-center justify-center w-10 h-10 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all duration-200"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Navigation buttons */}
            {gallery.photos.length > 1 && (
              <>
                <button
                  onClick={goToPrevPhoto}
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 flex items-center justify-center w-12 h-12 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all duration-200"
                >
                  <ChevronLeft className="w-8 h-8" />
                </button>
                <button
                  onClick={goToNextPhoto}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 flex items-center justify-center w-12 h-12 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all duration-200"
                >
                  <ChevronRight className="w-8 h-8" />
                </button>
              </>
            )}

            {/* Photo container */}
            <div 
              className="max-w-[95vw] max-h-[95vh] flex items-center justify-center"
              onClick={closePhoto}
            >
              <div onClick={(e) => e.stopPropagation()}>
                <img
                  src={`http://localhost:8000${gallery.photos[selectedPhotoIndex].full_url}`}
                  alt={`Photo ${gallery.photos[selectedPhotoIndex].photo_id}`}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                  loading="eager"
                />
              </div>
            </div>

            {/* Photo info and download */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-4 bg-black/50 text-white px-4 py-2 rounded-lg">
              <span className="text-sm">
                {selectedPhotoIndex + 1} of {gallery.photos.length}
              </span>
              <button
                onClick={() => handleDownloadPhoto(gallery.photos[selectedPhotoIndex].photo_id)}
                className="flex items-center gap-1 px-3 py-1 bg-white/20 hover:bg-white/30 rounded transition-colors text-sm"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
