import { useState, useCallback, useRef } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails';
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen';
import LightboxDownload from 'yet-another-react-lightbox/plugins/download';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/thumbnails.css';

interface PhotoSlide {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  download?: string;
  downloadFilename?: string;
}

interface UsePhotoLightboxOptions {
  /** Selector for photo card elements to enable scroll-to-photo on close */
  photoCardSelector?: string;
  /** Ref to the grid container for finding photo cards */
  gridRef?: React.RefObject<HTMLElement | null>;
  /** Callback when more photos need to be loaded (for infinite scroll) */
  onLoadMore?: (index: number) => void;
  /** Whether there are more photos to load */
  hasMore?: boolean;
  /** Whether photos are currently loading */
  isLoadingMore?: boolean;
  /** Number of photos from the end to trigger load more */
  loadMoreThreshold?: number;
}

export const usePhotoLightbox = (options: UsePhotoLightboxOptions = {}) => {
  const {
    photoCardSelector = '[data-photo-card]',
    gridRef,
    onLoadMore,
    hasMore = false,
    isLoadingMore = false,
    loadMoreThreshold = 10,
  } = options;

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const thumbnailsRef = useRef<{
    visible: boolean;
    show: () => void;
    hide: () => void;
  } | null>(null);

  // Open lightbox at specific photo index
  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  // Close lightbox
  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  // Handle thumbnails visibility on mobile
  const handleThumbnailsVisibility = useCallback(() => {
    if (!thumbnailsRef.current) return;

    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      thumbnailsRef.current?.hide();
    } else {
      thumbnailsRef.current?.show();
    }
  }, []);

  // Scroll to photo in grid when lightbox closes
  const handleLightboxExited = useCallback(() => {
    if (!gridRef?.current) return;

    const photoCards = gridRef.current.querySelectorAll(photoCardSelector);
    if (photoCards && photoCards[lightboxIndex]) {
      const photoElement = photoCards[lightboxIndex] as HTMLElement;
      photoElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }
  }, [lightboxIndex, gridRef, photoCardSelector]);

  // Render the Lightbox component
  const renderLightbox = (slides: PhotoSlide[], totalPhotos?: number) => (
    <Lightbox
      open={lightboxOpen}
      close={closeLightbox}
      index={lightboxIndex}
      slides={slides}
      plugins={[Thumbnails, Fullscreen, LightboxDownload, Zoom]}
      controller={{
        closeOnPullDown: true,
        closeOnPullUp: true,
        closeOnBackdropClick: true,
      }}
      thumbnails={{
        ref: thumbnailsRef,
        position: 'bottom',
        width: 120,
        height: 80,
        border: 0,
        borderRadius: 4,
        padding: 4,
        gap: 8,
      }}
      carousel={{
        finite: !hasMore,
        padding: '0px',
        spacing: 0,
        imageFit: 'contain',
      }}
      zoom={{
        maxZoomPixelRatio: 3,
        scrollToZoom: true,
      }}
      styles={{
        container: { backgroundColor: 'rgba(0, 0, 0, 0.85)' },
      }}
      download={{
        download: async ({ slide, saveAs }) => {
          const response = await fetch(slide.src);
          const blob = await response.blob();
          const filename =
            typeof slide.download === 'object' ? slide.download.filename : slide.alt || 'photo.jpg';
          saveAs(blob, filename);
        },
      }}
      on={{
        entered: () => {
          handleThumbnailsVisibility();
        },
        view: ({ index }) => {
          setLightboxIndex(index);

          // Load more photos when viewing near the end
          if (
            onLoadMore &&
            hasMore &&
            !isLoadingMore &&
            totalPhotos &&
            index >= totalPhotos - loadMoreThreshold
          ) {
            onLoadMore(index);
          }
        },
        exited: () => {
          handleLightboxExited();
        },
      }}
    />
  );

  return {
    lightboxOpen,
    lightboxIndex,
    openLightbox,
    closeLightbox,
    renderLightbox,
  };
};
