import { useState, useCallback, useRef } from 'react';
import type { ImgHTMLAttributes } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails';
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen';
import LightboxDownload from 'yet-another-react-lightbox/plugins/download';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/thumbnails.css';

const LIGHTBOX_PLUGINS = [Thumbnails, Fullscreen, LightboxDownload];

export interface PhotoSlide {
  src: string;
  thumbnailSrc?: string;
  alt?: string;
  width?: number;
  height?: number;
  download?: string;
  downloadFilename?: string;
  imageProps?: ImgHTMLAttributes<HTMLImageElement>;
}

interface InternalPhotoSlide extends Omit<PhotoSlide, 'src'> {
  type?: string;
  fullSrc: string;
  src?: string;
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

  const renderProgressiveSlide = useCallback(
    ({ slide, rect }: { slide: unknown; rect: { width: number; height: number } }) => {
      const progressiveSlide = slide as InternalPhotoSlide;
      if (progressiveSlide.type !== 'progressive') return undefined;

      return (
        <div
          style={{
            position: 'relative',
            width: rect.width,
            height: rect.height,
            overflow: 'hidden',
          }}
        >
          <img
            src={progressiveSlide.thumbnailSrc}
            alt={progressiveSlide.alt || ''}
            draggable={false}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              opacity: 1,
              transition: 'opacity 260ms ease',
            }}
          />
          <img
            src={progressiveSlide.fullSrc}
            alt={progressiveSlide.alt || ''}
            draggable={false}
            crossOrigin="anonymous"
            onLoad={(event) => {
              event.currentTarget.style.opacity = '1';
              const thumbnailImage = event.currentTarget
                .previousElementSibling as HTMLImageElement | null;
              if (thumbnailImage) {
                thumbnailImage.style.opacity = '0';
              }
            }}
            onError={(event) => {
              event.currentTarget.style.opacity = '1';
            }}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              opacity: 0,
              transition: 'opacity 420ms ease',
            }}
          />
        </div>
      );
    },
    [],
  );

  const renderProgressiveThumbnail = useCallback(
    ({ slide }: { slide: unknown; rect: { width: number; height: number } }) => {
      const progressiveSlide = slide as InternalPhotoSlide;
      if (progressiveSlide.type !== 'progressive') return undefined;

      return (
        <img
          src={progressiveSlide.src}
          alt={progressiveSlide.alt || ''}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      );
    },
    [],
  );

  // Render the Lightbox component
  const renderLightbox = (slides: PhotoSlide[], totalPhotos?: number) => (
    <Lightbox
      open={lightboxOpen}
      close={closeLightbox}
      index={lightboxIndex}
      slides={
        slides.map((slide) => {
          if (slide.thumbnailSrc) {
            // Progressive slide: mark as custom type to prevent YARL's preload
            return {
              type: 'progressive',
              src: slide.thumbnailSrc, // For Thumbnails plugin carousel
              fullSrc: slide.src,
              thumbnailSrc: slide.thumbnailSrc,
              alt: slide.alt,
              width: slide.width,
              height: slide.height,
              download: slide.download,
              downloadFilename: slide.downloadFilename,
              imageProps: slide.imageProps,
            } as InternalPhotoSlide;
          }
          // Standard slide: let YARL handle preload
          return {
            ...slide,
            imageProps: {
              ...slide.imageProps,
              crossOrigin: 'anonymous',
            },
          };
        }) as any
      }
      render={{
        slide: renderProgressiveSlide,
        thumbnail: renderProgressiveThumbnail,
        iconLoading: () => null,
      }}
      plugins={LIGHTBOX_PLUGINS}
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
          setLightboxIndex((prevIndex) => (prevIndex === index ? prevIndex : index));

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
