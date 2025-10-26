import { useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react'

interface Photo {
  id?: string
  photo_id?: string
  url?: string
  full_url?: string
  gallery_id?: string
}

interface PhotoModalProps {
  photos: Photo[]
  selectedIndex: number | null
  onClose: () => void
  onPrevious: () => void
  onNext: () => void
  onDownload?: (photoId: string) => void
  isPublic?: boolean
  shareId?: string
}

export const PhotoModal = ({
  photos,
  selectedIndex,
  onClose,
  onPrevious,
  onNext,
  onDownload
}: PhotoModalProps) => {
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex === null) return

      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowLeft':
          onPrevious()
          break
        case 'ArrowRight':
          onNext()
          break
      }
    }

    if (selectedIndex !== null) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedIndex, onClose, onPrevious, onNext])

  if (selectedIndex === null || !photos.length) {
    return null
  }

  const currentPhoto = photos[selectedIndex]
  const photoId = currentPhoto.id || currentPhoto.photo_id || ''
  // For public galleries, use full_url directly since we already have it from the gallery request
  // For private galleries, use the url which is already a presigned URL
  const photoUrl = currentPhoto.full_url || currentPhoto.url || ''

  return (
    <div
      className="fixed inset-0 z-[1060] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 flex items-center justify-center w-10 h-10 p-2 bg-surface-foreground/10 hover:bg-surface-foreground/20 text-white rounded-full transition-all duration-200 hover:scale-110"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Navigation buttons */}
      {photos.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); onPrevious(); }}
            className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 flex items-center justify-center w-12 h-12 p-2 bg-surface-foreground/10 hover:bg-surface-foreground/20 text-white rounded-full transition-all duration-200 hover:scale-110"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onNext(); }}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 flex items-center justify-center w-12 h-12 p-2 bg-surface-foreground/10 hover:bg-surface-foreground/20 text-white rounded-full transition-all duration-200 hover:scale-110"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </>
      )}

      {/* Photo container */}
      <div className="w-full h-full flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
        {/* For both public and private galleries, we now have presigned URLs directly */}
        <img
          src={photoUrl}
          alt={`Photo ${photoId}`}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          loading="eager"
        />
      </div>

      {/* Photo info */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-4 bg-surface-foreground/50 text-white px-4 py-2 rounded-lg">
        <span className="text-sm">
          {selectedIndex + 1} of {photos.length}
        </span>
        {onDownload && (
          <button
            onClick={() => onDownload(photoId)}
            className="flex items-center gap-1 px-3 py-1 bg-surface-foreground/20 hover:bg-surface-foreground/30 rounded text-sm transition-all duration-200 hover:scale-105"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        )}
      </div>
    </div>
  )
}
