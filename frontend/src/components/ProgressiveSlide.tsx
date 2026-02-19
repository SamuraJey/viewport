import { useEffect, useState } from 'react';
import {
    isImageFitCover,
    isImageSlide,
    useLightboxProps,
    useLightboxState,
} from 'yet-another-react-lightbox';
import type { RenderSlideProps, Slide } from 'yet-another-react-lightbox';

interface ProgressiveSlideProps extends RenderSlideProps {
    // Zoom plugin extends render.slide props with these
    zoom?: number;
    maxZoom?: number;
}

interface PhotoSlideWithThumbnail extends Slide {
    src: string;
    alt?: string;
    width?: number;
    height?: number;
    thumbnailSrc?: string;
}

const loadedFullImageSrc = new Set<string>();
const isDev = import.meta.env.DEV;

function shortSrc(src: string): string {
    const [path] = src.split('?');
    return path.split('/').pop() || path;
}

function debugLog(event: string, src: string, extra?: Record<string, unknown>) {
    if (!isDev) return;

    console.log('[ProgressiveSlide]', {
        event,
        src: shortSrc(src),
        loaded: loadedFullImageSrc.has(src),
        ...extra,
    });
}

function hasKnownDimensions(
    slide: PhotoSlideWithThumbnail,
): slide is PhotoSlideWithThumbnail & { width: number; height: number } {
    return typeof slide.width === 'number' && typeof slide.height === 'number';
}

/**
 * Progressive slide renderer for yet-another-react-lightbox.
 * Shows the cached thumbnail immediately, then crossfades to the
 * full-resolution image once it finishes loading.
 *
 * Returns `undefined` for slides that:
 * - are not standard image slides
 * - have no thumbnailSrc (falls through to YARL default, zoom unaffected)
 * - have no width/height (sizing math would break zoom panning)
 */
export function ProgressiveSlide({ slide, offset, rect }: ProgressiveSlideProps) {
    const typedSlide = slide as PhotoSlideWithThumbnail;
    const isRenderableImageSlide =
        isImageSlide(slide) && !!typedSlide.thumbnailSrc && hasKnownDimensions(typedSlide);

    const [fullLoaded, setFullLoaded] = useState(
        Boolean(typedSlide.src && loadedFullImageSrc.has(typedSlide.src)),
    );
    const [thumbHidden, setThumbHidden] = useState(false);

    const {
        on: { click },
        carousel: { imageFit },
    } = useLightboxProps();

    const { currentIndex } = useLightboxState();

    const shouldRenderFullImage = Math.abs(offset) <= 1;
    const isActiveSlide = offset === 0;

    useEffect(() => {
        if (!typedSlide.src || !isRenderableImageSlide) {
            return;
        }

        debugLog('effect', typedSlide.src, {
            offset,
            currentIndex,
            fullLoadedAtStart: loadedFullImageSrc.has(typedSlide.src),
            shouldRenderFullImage,
        });

        setThumbHidden(false);
        setFullLoaded(loadedFullImageSrc.has(typedSlide.src));

        return () => {
            debugLog('effect-cleanup', typedSlide.src, { offset, currentIndex });
        };
    }, [typedSlide.src, offset, currentIndex, isRenderableImageSlide, shouldRenderFullImage]);

    // Fall through to YARL default renderer in these cases so zoom still works
    if (!isRenderableImageSlide) {
        return undefined;
    }

    const cover = isImageFitCover(slide, imageFit);

    // Mirror YARL's sizing formula so zoom panning stays centred
    const width = !cover
        ? Math.round(Math.min(rect.width, (rect.height / typedSlide.height) * typedSlide.width))
        : rect.width;

    const height = !cover
        ? Math.round(Math.min(rect.height, (rect.width / typedSlide.width) * typedSlide.height))
        : rect.height;

    const handleFullLoad = () => {
        loadedFullImageSrc.add(typedSlide.src);
        debugLog('full-img-onload', typedSlide.src, { offset, currentIndex });
        setFullLoaded(true);
    };

    const handleThumbTransitionEnd = () => {
        if (fullLoaded) {
            setThumbHidden(true);
        }
    };

    const handleClick =
        offset === 0 ? () => click?.({ index: currentIndex }) : undefined;

    return (
        <div
            style={{ position: 'relative', width, height, cursor: handleClick ? 'pointer' : undefined }}
            onClick={handleClick}
        >
            {/* Thumbnail placeholder layer — hidden after full image transition completes */}
            {!thumbHidden && isActiveSlide && (
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
                    }}
                    onTransitionEnd={handleThumbTransitionEnd}
                />
            )}

            {/* Full-resolution image layer (current + adjacent slides for preload) */}
            {shouldRenderFullImage && (
                <img
                    src={typedSlide.src}
                    alt={typedSlide.alt ?? ''}
                    draggable={false}
                    crossOrigin="anonymous"
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: cover ? 'cover' : 'contain',
                        opacity: isActiveSlide && fullLoaded ? 1 : 0,
                        transition: 'opacity 300ms ease',
                        pointerEvents: isActiveSlide ? undefined : 'none',
                    }}
                    onLoad={handleFullLoad}
                />
            )}
        </div>
    );
}
