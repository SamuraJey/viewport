import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  isImageFitCover,
  isImageSlide,
  useLightboxProps,
  useLightboxState,
} from 'yet-another-react-lightbox';
import type { RenderSlideContainerProps, Slide } from 'yet-another-react-lightbox';

interface PhotoSlideWithThumbnail extends Slide {
  src: string;
  thumbnailSrc?: string;
}

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

  const {
    carousel: { imageFit },
  } = useLightboxProps();
  const { currentSlide } = useLightboxState();

  const typedSlide = slide as PhotoSlideWithThumbnail;
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

  useEffect(() => {
    if (!isActiveImageSlide) {
      setFullLoaded(false);
      setThumbHidden(false);
      return;
    }

    const fullImage = zoomWrapperElement?.querySelector(
      'img.yarl__slide_image',
    ) as HTMLImageElement | null;

    if (!fullImage) {
      setFullLoaded(false);
      setThumbHidden(false);
      return;
    }

    if (fullImage.complete && fullImage.naturalWidth > 0) {
      setFullLoaded(true);
      setThumbHidden(true);
      return;
    }

    setFullLoaded(false);
    setThumbHidden(false);

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

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
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
