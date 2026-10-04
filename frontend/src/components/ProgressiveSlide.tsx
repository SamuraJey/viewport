import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  isImageFitCover,
  isImageSlide,
  useLightboxProps,
  useLightboxState,
} from 'yet-another-react-lightbox';
import type { RenderSlideContainerProps, Slide } from 'yet-another-react-lightbox';

type PhotoSlideWithThumbnail = Slide & {
  src: string;
  thumbnailSrc?: string;
  media_type?: 'image' | 'video';
  previewRotation?: number;
};

/**
 * Progressive thumbnail overlay for yet-another-react-lightbox.
 * Keeps the default image renderer (and therefore native Zoom behavior),
 * while showing thumbnail over the active slide until full image is loaded.
 */
export function ProgressiveSlide({ slide, children }: RenderSlideContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomWrapperElement, setZoomWrapperElement] = useState<HTMLElement | null>(null);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [thumbHidden, setThumbHidden] = useState(false);
  const [previewArea, setPreviewArea] = useState({ width: 0, height: 0 });

  const {
    carousel: { imageFit },
  } = useLightboxProps();
  const { currentSlide } = useLightboxState();

  const typedSlide = slide as PhotoSlideWithThumbnail;
  const previewRotation = typedSlide.previewRotation ?? 0;
  useEffect(() => {
    const element = containerRef.current;
    if (!element || !previewRotation || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() =>
      setPreviewArea({ width: element.clientWidth, height: element.clientHeight }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [previewRotation]);
  let previewScale = 1;
  if (
    previewRotation % 180 &&
    isImageSlide(slide) &&
    slide.width &&
    slide.height &&
    previewArea.width &&
    previewArea.height
  ) {
    const fit = Math.min(previewArea.width / slide.width, previewArea.height / slide.height);
    previewScale = Math.min(
      previewArea.width / (slide.height * fit),
      previewArea.height / (slide.width * fit),
    );
  }
  const currentImageSlide = currentSlide && isImageSlide(currentSlide) ? currentSlide : undefined;

  const isActiveImageSlide =
    isImageSlide(slide) &&
    !!typedSlide.thumbnailSrc &&
    !!currentImageSlide &&
    currentImageSlide.src === typedSlide.src;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isActiveImageSlide) {
      setZoomWrapperElement(null);
      return;
    }

    const wrapper = container.querySelector('.yarl__slide_wrapper') as HTMLElement | null;
    setZoomWrapperElement(wrapper);
  }, [isActiveImageSlide, typedSlide.src]);

  // Reset load tracking whenever the active slide or its wrapper changes;
  // the effect below upgrades to "loaded" for cached images.
  const [lastLoadKey, setLastLoadKey] = useState<string | null>(null);
  const loadKey = `${typedSlide.src}|${isActiveImageSlide}|${zoomWrapperElement ? '1' : '0'}`;
  if (loadKey !== lastLoadKey) {
    setLastLoadKey(loadKey);
    setFullLoaded(false);
    setThumbHidden(false);
  }

  useEffect(() => {
    if (!isActiveImageSlide) {
      return;
    }

    const fullImage = zoomWrapperElement?.querySelector(
      'img.yarl__slide_image',
    ) as HTMLImageElement | null;

    if (!fullImage) {
      return;
    }

    if (fullImage.complete && fullImage.naturalWidth > 0) {
      queueMicrotask(() => {
        setFullLoaded(true);
        setThumbHidden(true);
      });
      return;
    }

    const handleLoad = () => {
      setFullLoaded(true);
    };

    fullImage.addEventListener('load', handleLoad, { once: true });

    return () => {
      fullImage.removeEventListener('load', handleLoad);
    };
  }, [typedSlide.src, isActiveImageSlide, zoomWrapperElement]);

  const handleThumbTransitionEnd = () => {
    if (fullLoaded) {
      setThumbHidden(true);
    }
  };

  const cover = isImageSlide(slide) && isImageFitCover(slide, imageFit);
  const isVideoSlide = typedSlide.media_type === 'video';

  // Video slides: render children directly (video player handles its own poster/loading)
  if (isVideoSlide) {
    return (
      <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        transform: previewRotation
          ? `rotate(${previewRotation}deg) scale(${previewScale})`
          : undefined,
      }}
    >
      {children}

      {isActiveImageSlide && !thumbHidden && zoomWrapperElement
        ? createPortal(
            <img
              src={typedSlide.thumbnailSrc}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: cover ? 'cover' : 'contain',
                opacity: fullLoaded ? 0 : 1,
                transition: 'opacity 300ms ease',
                pointerEvents: 'none',
                zIndex: 2,
              }}
              onTransitionEnd={handleThumbTransitionEnd}
            />,
            zoomWrapperElement,
          )
        : null}
    </div>
  );
}
