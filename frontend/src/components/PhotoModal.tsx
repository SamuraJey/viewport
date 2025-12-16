import { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';

interface Photo {
  id?: string;
  photo_id?: string;
  url?: string;
  full_url?: string;
  gallery_id?: string;
}

interface PhotoModalProps {
  photos: Photo[];
  selectedIndex: number | null;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onDownload?: (photoId: string) => void;
  isPublic?: boolean;
  shareId?: string;
}

export const PhotoModal = ({
  photos,
  selectedIndex,
  onClose,
  onPrevious,
  onNext,
  onDownload,
}: PhotoModalProps) => {
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex === null) return;

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          onPrevious();
          break;
        case 'ArrowRight':
          onNext();
          break;
      }
    };

    if (selectedIndex !== null) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedIndex, onClose, onPrevious, onNext]);

  if (selectedIndex === null || !photos.length) {
    return null;
  }

  const currentPhoto = photos[selectedIndex];
  const photoId = currentPhoto.id || currentPhoto.photo_id || '';
  // For public galleries, use full_url directly since we already have it from the gallery request
  // For private galleries, use the url which is already a presigned URL
  const photoUrl = currentPhoto.full_url || currentPhoto.url || '';

  return (
    <div
      className="fixed inset-0 z-[1060] flex items-center justify-center bg-black/95"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        title="Close (Esc)"
        className="absolute top-6 right-6 z-10 flex items-center justify-center w-10 h-10 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 border border-white/20"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Navigation buttons */}
      {photos.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPrevious();
            }}
            title="Previous (←)"
            className="absolute left-6 top-1/2 transform -translate-y-1/2 z-10 flex items-center justify-center w-12 h-12 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 border border-white/20"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            title="Next (→)"
            className="absolute right-6 top-1/2 transform -translate-y-1/2 z-10 flex items-center justify-center w-12 h-12 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 border border-white/20"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </>
      )}

      {/* Photo container */}
      <div
        className="w-full h-full flex items-center justify-center p-4 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={photoUrl}
          alt={`Photo ${photoId}`}
          className="max-w-full max-h-[calc(100vh-120px)] object-contain"
          loading="eager"
        />
      </div>

      {/* Photo info and controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-white/90">
            {selectedIndex + 1} of {photos.length}
          </span>
          <div className="w-48 h-1 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white/60 transition-all duration-300"
              style={{ width: `${((selectedIndex + 1) / photos.length) * 100}%` }}
            />
          </div>
        </div>
        {onDownload && (
          <button
            onClick={() => onDownload(photoId)}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg text-sm font-medium transition-all duration-200 hover:shadow-lg hover:scale-105 active:scale-95 border border-accent/30"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        )}
      </div>
    </div>
  );
};
