import { useState, useCallback, useRef } from 'react';
import type { ImgHTMLAttributes } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails';
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen';
import LightboxDownload from 'yet-another-react-lightbox/plugins/download';
import Video from 'yet-another-react-lightbox/plugins/video';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/thumbnails.css';
import { ProgressiveSlide } from '../components/ProgressiveSlide';
import { PhotoRotationButtons } from '../components/gallery/PhotoRotationButtons';
import type { ZoomRef } from 'yet-another-react-lightbox';

export interface PhotoSlide {
  canRotate?: boolean;
  rotationPending?: boolean;
  previewRotation?: number;
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  /** Thumbnail URL shown immediately as a blurred placeholder while the full image loads */
  thumbnailSrc?: string;
  download?: boolean | string | { url: string; filename: string };
  downloadFilename?: string;
  onDownload?: () => void | Promise<void>;
  imageProps?: ImgHTMLAttributes<HTMLImageElement>;
  /** Media type: 'image' or 'video'. Videos render a video player in the lightbox. */
  media_type?: 'image' | 'video';
  /** Playback URL for video slides. Required when media_type is 'video'. */
  playback_url?: string;
  /** Duration in milliseconds for video slides. */
  duration_ms?: number;
}

interface UsePhotoLightboxOptions {
  onRotatePhoto?: (index: number, direction: -90 | 90) => void;
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
  /** Show a collection-wide position indicator for callers whose slides start at item one */
  showPositionIndicator?: boolean;
}

export const usePhotoLightbox = (options: UsePhotoLightboxOptions = {}) => {
  const {
    photoCardSelector = '[data-photo-card]',
    gridRef,
    onLoadMore,
    hasMore = false,
    isLoadingMore = false,
    loadMoreThreshold = 10,
    showPositionIndicator = false,
    onRotatePhoto,
  } = options;

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const zoomRef = useRef<ZoomRef | null>(null);

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
  const renderLightbox = (slides: PhotoSlide[], totalPhotos?: number) => {
    const areAllPhotosLoaded = totalPhotos !== undefined ? slides.length >= totalPhotos : !hasMore;
    const currentPosition = lightboxIndex + 1;
    const displayedTotal = Math.max(totalPhotos ?? slides.length, slides.length, currentPosition);

    return (
      <Lightbox
        className="backdrop-blur-md bg-black/95"
        open={lightboxOpen}
        close={closeLightbox}
        index={lightboxIndex}
        slides={slides.map((slide) => {
          if (slide.media_type === 'video' && slide.playback_url) {
            // Build a YARL video slide, preserving download metadata
            return {
              type: 'video',
              sources: [{ src: slide.playback_url, type: 'video/mp4' }],
              poster: slide.thumbnailSrc,
              width: slide.width,
              height: slide.height,
              alt: slide.alt,
              download: slide.download,
              downloadFilename: slide.downloadFilename || slide.alt || 'video.mp4',
              onDownload: slide.onDownload,
            };
          }
          return {
            ...slide,
            imageProps: {
              ...slide.imageProps,
              crossOrigin: 'anonymous',
            },
          };
        })}
        plugins={[Thumbnails, Fullscreen, LightboxDownload, Video, Zoom]}
        toolbar={
          onRotatePhoto
            ? {
                buttons: [
                  ...(slides[lightboxIndex]?.canRotate
                    ? [
                        <PhotoRotationButtons
                          key="rotate"
                          className="text-white hover:bg-white/15 focus-visible:outline-white"
                          onRotate={(direction) => {
                            zoomRef.current?.changeZoom(1, true);
                            onRotatePhoto(lightboxIndex, direction);
                          }}
                        />,
                      ]
                    : []),
                  ...(slides[lightboxIndex]?.rotationPending
                    ? [
                        <span
                          key="saving"
                          role="status"
                          className="inline-flex min-h-11 items-center px-2 text-xs text-white/80"
                        >
                          Saving rotation…
                        </span>,
                      ]
                    : []),
                  'close',
                ],
              }
            : undefined
        }
        render={{
          slideContainer: ProgressiveSlide,
          controls: showPositionIndicator
            ? () => (
                <div
                  role="status"
                  aria-label={`Item ${currentPosition} of ${displayedTotal}`}
                  className="pointer-events-none absolute left-4 top-4 z-10 rounded-full bg-photo-overlay px-3 py-1.5 text-sm font-medium tabular-nums text-white shadow-sm backdrop-blur-md sm:left-6 sm:top-6"
                >
                  <span aria-hidden="true">
                    {currentPosition} / {displayedTotal}
                  </span>
                </div>
              )
            : undefined,
        }}
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
          finite: !areAllPhotosLoaded,
          padding: '0px',
          spacing: 0,
          imageFit: 'contain',
        }}
        zoom={{
          ref: zoomRef,
          // A ratio of 1 still magnifies large originals. Clamp the thumbnail
          // preview to the plugin's minimum zoom (1x) until publication.
          maxZoomPixelRatio: slides[lightboxIndex]?.rotationPending ? 0 : 3,
          scrollToZoom: true,
        }}
        styles={{
          container: { backgroundColor: 'rgba(0, 0, 0, 0.85)' },
          ...(onRotatePhoto ? { toolbar: { flexWrap: 'wrap', maxWidth: '100%' } } : {}),
        }}
        download={{
          download: ({ slide, saveAs }) => {
            if ('onDownload' in slide && typeof slide.onDownload === 'function') {
              void slide.onDownload();
              return;
            }
            const dl = slide as unknown as Record<string, unknown>;
            const downloadSource =
              typeof dl.download === 'object' && dl.download !== null
                ? (dl.download as { url: string }).url
                : typeof dl.download === 'string'
                  ? dl.download
                  : typeof dl.src === 'string'
                    ? dl.src
                    : Array.isArray(dl.sources) && typeof dl.sources[0]?.src === 'string'
                      ? dl.sources[0].src
                      : '';
            const downloadFilename =
              typeof dl.downloadFilename === 'string'
                ? dl.downloadFilename
                : typeof dl.download === 'object' && dl.download !== null
                  ? (dl.download as { filename?: string }).filename
                  : null;
            const filename =
              downloadFilename || (typeof dl.alt === 'string' ? dl.alt : 'photo.jpg');
            saveAs(downloadSource, filename);
          },
        }}
        on={{
          entered: () => {
            handleThumbnailsVisibility();
          },
          view: ({ index }) => {
            setLightboxIndex(index);

            // Load more photos when viewing near the end of the currently loaded batch
            if (
              onLoadMore &&
              hasMore &&
              !isLoadingMore &&
              slides.length > 0 &&
              index >= slides.length - loadMoreThreshold
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
  };

  return {
    lightboxOpen,
    lightboxIndex,
    openLightbox,
    closeLightbox,
    renderLightbox,
  };
};
