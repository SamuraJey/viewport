import { useEffect, useRef, useState, useCallback } from 'react';
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
  isLoadingMore?: boolean;
  hasMore?: boolean;
  totalPhotos?: number;
}

// Touch/swipe handling hook with support for horizontal navigation and vertical close
const useSwipeGesture = (
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  onSwipeUp: () => void,
  enabled: boolean = true,
) => {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(1);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || touchStartX.current === null || touchStartY.current === null) return;

      const touchCurrentY = e.touches[0].clientY;
      const diffY = touchStartY.current - touchCurrentY;

      // Only track upward swipe for visual feedback (positive diffY = swipe up)
      if (diffY > 0) {
        const clampedY = Math.min(diffY, 200);
        setSwipeOffset({ x: 0, y: -clampedY });
        // Fade out as user swipes up
        setOpacity(Math.max(1 - clampedY / 200, 0.3));
      }
    },
    [enabled],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || touchStartX.current === null || touchStartY.current === null) {
        setSwipeOffset({ x: 0, y: 0 });
        setOpacity(1);
        return;
      }

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const diffX = touchStartX.current - touchEndX;
      const diffY = touchStartY.current - touchEndY;

      const minSwipeDistance = 50;
      const minVerticalSwipeDistance = 100;

      // Check for vertical swipe up first (positive diffY = swipe up)
      if (diffY > minVerticalSwipeDistance && Math.abs(diffY) > Math.abs(diffX)) {
        onSwipeUp(); // Swipe up = close
      } else if (Math.abs(diffX) > minSwipeDistance && Math.abs(diffX) > Math.abs(diffY)) {
        // Horizontal swipe for navigation
        if (diffX > 0) {
          onSwipeLeft(); // Swipe left = next
        } else {
          onSwipeRight(); // Swipe right = previous
        }
      }

      // Reset visual state
      setSwipeOffset({ x: 0, y: 0 });
      setOpacity(1);
      touchStartX.current = null;
      touchStartY.current = null;
    },
    [enabled, onSwipeLeft, onSwipeRight, onSwipeUp],
  );

  const resetSwipe = useCallback(() => {
    setSwipeOffset({ x: 0, y: 0 });
    setOpacity(1);
  }, []);

  return { handleTouchStart, handleTouchMove, handleTouchEnd, swipeOffset, opacity, resetSwipe };
};

// Pinch-to-zoom hook
const usePinchZoom = () => {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const initialDistance = useRef<number | null>(null);
  const initialScale = useRef(1);
  const lastCenter = useRef<{ x: number; y: number } | null>(null);

  const getDistance = (touches: React.TouchList) => {
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    );
  };

  const getCenter = (touches: React.TouchList) => ({
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  });

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        initialDistance.current = getDistance(e.touches);
        initialScale.current = scale;
        lastCenter.current = getCenter(e.touches);
      }
    },
    [scale],
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialDistance.current !== null) {
      e.preventDefault();
      const currentDistance = getDistance(e.touches);
      const newScale = Math.min(
        Math.max(initialScale.current * (currentDistance / initialDistance.current), 1),
        4,
      );
      setScale(newScale);

      // Handle panning when zoomed
      if (newScale > 1) {
        const previousCenter = lastCenter.current || getCenter(e.touches);
        const currentCenter = getCenter(e.touches);
        setTranslate((prev) => ({
          x: prev.x + (currentCenter.x - previousCenter.x),
          y: prev.y + (currentCenter.y - previousCenter.y),
        }));
        lastCenter.current = currentCenter;
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    initialDistance.current = null;
    lastCenter.current = null;
    // Reset to normal if scale is close to 1
    if (scale < 1.1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    }
  }, [scale]);

  const resetZoom = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  return {
    scale,
    translate,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    resetZoom,
    isZoomed: scale > 1,
  };
};

export const PhotoModal = ({
  photos,
  selectedIndex,
  onClose,
  onPrevious,
  onNext,
  onDownload,
  isLoadingMore = false,
  hasMore = false,
  totalPhotos,
}: PhotoModalProps) => {
  const [imageKey, setImageKey] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const {
    scale,
    translate,
    handleTouchStart: handlePinchStart,
    handleTouchMove,
    handleTouchEnd: handlePinchEnd,
    resetZoom,
    isZoomed,
  } = usePinchZoom();
  const {
    handleTouchStart: handleSwipeStart,
    handleTouchMove: handleSwipeMove,
    handleTouchEnd: handleSwipeEnd,
    swipeOffset,
    opacity: swipeOpacity,
    resetSwipe,
  } = useSwipeGesture(onNext, onPrevious, onClose, !isZoomed);

  // Reset zoom and swipe state, trigger animation when changing photos
  useEffect(() => {
    resetZoom();
    resetSwipe();
    setImageKey((prev) => prev + 1);
    setIsAnimating(true);
    const timer = setTimeout(() => setIsAnimating(false), 180);
    return () => clearTimeout(timer);
  }, [selectedIndex, resetZoom, resetSwipe]);

  // Handle browser back button to close modal instead of navigating away
  // Track if modal is open to avoid re-pushing history on every selectedIndex change
  const isModalOpen = selectedIndex !== null;
  const hasAddedHistoryState = useRef(false);

  useEffect(() => {
    if (!isModalOpen) {
      // Modal closed - clean up history state if we added one
      if (hasAddedHistoryState.current && window.history.state?.photoModal) {
        window.history.back();
        hasAddedHistoryState.current = false;
      }
      return;
    }

    // Modal just opened - push history state only once
    if (!hasAddedHistoryState.current) {
      const modalState = { photoModal: true };
      window.history.pushState(modalState, '');
      hasAddedHistoryState.current = true;
    }

    const handlePopState = () => {
      // Back button pressed - close the modal
      hasAddedHistoryState.current = false;
      onClose();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isModalOpen, onClose]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex === null || isAnimating) return;

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
  }, [selectedIndex, onClose, onPrevious, onNext, isAnimating]);

  // Combined touch handlers
  const handleTouchStartCombined = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        handlePinchStart(e);
      } else if (e.touches.length === 1) {
        handleSwipeStart(e);
      }
    },
    [handlePinchStart, handleSwipeStart],
  );

  const handleTouchMoveCombined = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        handleTouchMove(e);
      } else if (e.touches.length === 1) {
        handleSwipeMove(e);
      }
    },
    [handleTouchMove, handleSwipeMove],
  );

  const handleTouchEndCombined = useCallback(
    (e: React.TouchEvent) => {
      handlePinchEnd();
      handleSwipeEnd(e);
    },
    [handlePinchEnd, handleSwipeEnd],
  );

  if (selectedIndex === null || !photos.length) {
    return null;
  }

  const currentPhoto = photos[selectedIndex];
  const photoId = currentPhoto.id || currentPhoto.photo_id || '';
  const photoUrl = currentPhoto.full_url || currentPhoto.url || '';

  return (
    <div
      className="fixed inset-0 z-1060 flex items-center justify-center bg-black/95 touch-none transition-opacity duration-200"
      style={{ opacity: swipeOpacity }}
      onClick={onClose}
      onTouchStart={handleTouchStartCombined}
      onTouchMove={handleTouchMoveCombined}
      onTouchEnd={handleTouchEndCombined}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        title="Close (Esc)"
        className="absolute top-6 right-6 z-10 flex items-center justify-center w-10 h-10 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors duration-200 border border-white/20"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Navigation buttons - hide on touch devices when zoomed */}
      {photos.length > 1 && !isZoomed && (
        <>
          {/* Previous button - hide if at start and more photos can be loaded */}
          {(selectedIndex > 0 || !hasMore) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isAnimating) onPrevious();
              }}
              title="Previous (←)"
              className="absolute left-6 top-1/2 transform -translate-y-1/2 z-10 flex items-center justify-center w-12 h-12 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors duration-200 border border-white/20"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}
          {/* Next button - always show if not on last photo, or on last but can loop back (all loaded) */}
          {(selectedIndex < photos.length - 1 || !hasMore) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isAnimating) onNext();
              }}
              title="Next (→)"
              className="absolute right-6 top-1/2 transform -translate-y-1/2 z-10 flex items-center justify-center w-12 h-12 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors duration-200 border border-white/20"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}
        </>
      )}

      {/* Photo container with zoom and swipe support */}
      <div
        className="w-full h-full flex items-center justify-center p-4 sm:p-6 overflow-hidden transition-transform duration-200"
        style={{
          transform: `translateY(${swipeOffset.y}px)`,
        }}
      >
        <img
          key={imageKey}
          src={photoUrl}
          alt={`Photo ${photoId}`}
          onClick={(e) => e.stopPropagation()}
          className="max-w-full max-h-[calc(100vh-120px)] object-contain select-none animate-photo-fade-in"
          style={{
            transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
            transition: scale === 1 ? 'transform 0.2s ease-out' : 'none',
          }}
          loading="eager"
          draggable={false}
        />
      </div>

      {/* Photo info and controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 via-black/40 to-transparent p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-white/90">
              {selectedIndex + 1} of {totalPhotos ?? photos.length}
            </span>
            {isLoadingMore && selectedIndex >= photos.length - 10 && (
              <div className="flex items-center gap-2 px-2 py-1 bg-white/10 text-white/90 rounded text-xs backdrop-blur-sm">
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Loading more...</span>
              </div>
            )}
          </div>
          <div className="w-48 h-1 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white/60 transition-all duration-300"
              style={{ width: `${((selectedIndex + 1) / (totalPhotos ?? photos.length)) * 100}%` }}
            />
          </div>
        </div>
        {onDownload && (
          <button
            onClick={() => onDownload(photoId)}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg text-sm font-medium transition-colors duration-200 border border-accent/30"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        )}
      </div>
    </div>
  );
};
