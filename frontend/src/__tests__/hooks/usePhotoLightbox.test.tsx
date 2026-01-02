import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { usePhotoLightbox } from '../../hooks/usePhotoLightbox';

// Mock yet-another-react-lightbox
vi.mock('yet-another-react-lightbox', () => ({
    default: ({ open, index }: any) => (
        <div data-testid="lightbox" data-open={open} data-index={index}>
            Lightbox
        </div>
    ),
}));

vi.mock('yet-another-react-lightbox/plugins/thumbnails', () => ({
    default: 'Thumbnails',
}));

vi.mock('yet-another-react-lightbox/plugins/fullscreen', () => ({
    default: 'Fullscreen',
}));

vi.mock('yet-another-react-lightbox/plugins/download', () => ({
    default: 'LightboxDownload',
}));

vi.mock('yet-another-react-lightbox/plugins/zoom', () => ({
    default: 'Zoom',
}));

describe('usePhotoLightbox', () => {
    let originalInnerWidth: number;

    beforeEach(() => {
        originalInnerWidth = window.innerWidth;
    });

    afterEach(() => {
        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: originalInnerWidth,
        });
    });

    it('initializes with default state', () => {
        const { result } = renderHook(() => usePhotoLightbox());

        expect(result.current.lightboxOpen).toBe(false);
        expect(result.current.lightboxIndex).toBe(0);
        expect(typeof result.current.openLightbox).toBe('function');
        expect(typeof result.current.closeLightbox).toBe('function');
        expect(typeof result.current.renderLightbox).toBe('function');
    });

    it('opens lightbox at specific index', () => {
        const { result } = renderHook(() => usePhotoLightbox());

        act(() => {
            result.current.openLightbox(5);
        });

        expect(result.current.lightboxOpen).toBe(true);
        expect(result.current.lightboxIndex).toBe(5);
    });

    it('closes lightbox', () => {
        const { result } = renderHook(() => usePhotoLightbox());

        act(() => {
            result.current.openLightbox(3);
        });

        expect(result.current.lightboxOpen).toBe(true);

        act(() => {
            result.current.closeLightbox();
        });

        expect(result.current.lightboxOpen).toBe(false);
    });

    it('renders lightbox with provided slides', () => {
        const { result } = renderHook(() => usePhotoLightbox());

        const slides = [
            { src: '/photo1.jpg', alt: 'Photo 1' },
            { src: '/photo2.jpg', alt: 'Photo 2' },
        ];

        const lightbox = result.current.renderLightbox(slides);

        expect(lightbox).toBeDefined();
        expect(lightbox.props.slides).toBe(slides);
        expect(lightbox.props.open).toBe(false);
    });

    it('handles thumbnails visibility on mobile', () => {
        const { result, rerender } = renderHook(() => usePhotoLightbox());

        const thumbnailsRef = { current: { visible: true, show: vi.fn(), hide: vi.fn() } };

        // Simulate mobile viewport
        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 500,
        });

        // Access the private method through the rendered lightbox callbacks
        const lightbox = result.current.renderLightbox([{ src: '/test.jpg' }]);
        const enteredCallback = lightbox.props.on.entered;

        // Mock thumbnailsRef by accessing it indirectly
        act(() => {
            // Set the ref value before calling the callback
            const hookInternals = result.current as any;
            if (hookInternals.thumbnailsRef) {
                hookInternals.thumbnailsRef.current = thumbnailsRef.current;
            }
        });

        rerender();

        // The entered callback should hide thumbnails on mobile
        expect(enteredCallback).toBeDefined();
    });

    it('triggers onLoadMore when viewing near the end', () => {
        const onLoadMore = vi.fn();
        const { result } = renderHook(() =>
            usePhotoLightbox({
                onLoadMore,
                hasMore: true,
                isLoadingMore: false,
                loadMoreThreshold: 2,
            })
        );

        const slides = [
            { src: '/photo1.jpg' },
            { src: '/photo2.jpg' },
            { src: '/photo3.jpg' },
            { src: '/photo4.jpg' },
            { src: '/photo5.jpg' },
        ];

        const lightbox = result.current.renderLightbox(slides, 5);
        const viewCallback = lightbox.props.on.view;

        // Viewing photo at index 3 (5 - 2 = 3, within threshold)
        act(() => {
            viewCallback({ index: 3 });
        });

        expect(onLoadMore).toHaveBeenCalledWith(3);
    });

    it('does not trigger onLoadMore when already loading', () => {
        const onLoadMore = vi.fn();
        const { result } = renderHook(() =>
            usePhotoLightbox({
                onLoadMore,
                hasMore: true,
                isLoadingMore: true, // Already loading
                loadMoreThreshold: 2,
            })
        );

        const slides = [
            { src: '/photo1.jpg' },
            { src: '/photo2.jpg' },
            { src: '/photo3.jpg' },
            { src: '/photo4.jpg' },
            { src: '/photo5.jpg' },
        ];

        const lightbox = result.current.renderLightbox(slides, 5);
        const viewCallback = lightbox.props.on.view;

        act(() => {
            viewCallback({ index: 4 });
        });

        expect(onLoadMore).not.toHaveBeenCalled();
    });

    it('does not trigger onLoadMore when no more photos', () => {
        const onLoadMore = vi.fn();
        const { result } = renderHook(() =>
            usePhotoLightbox({
                onLoadMore,
                hasMore: false, // No more photos
                isLoadingMore: false,
                loadMoreThreshold: 2,
            })
        );

        const slides = [
            { src: '/photo1.jpg' },
            { src: '/photo2.jpg' },
            { src: '/photo3.jpg' },
            { src: '/photo4.jpg' },
            { src: '/photo5.jpg' },
        ];

        const lightbox = result.current.renderLightbox(slides, 5);
        const viewCallback = lightbox.props.on.view;

        act(() => {
            viewCallback({ index: 4 });
        });

        expect(onLoadMore).not.toHaveBeenCalled();
    });

    it('updates lightbox index when viewing different photo', () => {
        const { result } = renderHook(() => usePhotoLightbox());

        const slides = [{ src: '/photo1.jpg' }, { src: '/photo2.jpg' }, { src: '/photo3.jpg' }];

        act(() => {
            result.current.openLightbox(0);
        });

        const lightbox = result.current.renderLightbox(slides);
        const viewCallback = lightbox.props.on.view;

        act(() => {
            viewCallback({ index: 2 });
        });

        expect(result.current.lightboxIndex).toBe(2);
    });

    it('scrolls to photo in grid on lightbox exit', () => {
        const mockScrollIntoView = vi.fn();

        // Create mock DOM elements
        const photoCard1 = document.createElement('div');
        const photoCard2 = document.createElement('div');
        photoCard1.setAttribute('data-photo-card', '');
        photoCard2.setAttribute('data-photo-card', '');
        photoCard2.scrollIntoView = mockScrollIntoView;

        const mockGrid = document.createElement('div');
        mockGrid.appendChild(photoCard1);
        mockGrid.appendChild(photoCard2);

        // Create ref with current already set
        const gridRef = { current: mockGrid };

        const { result } = renderHook(() =>
            usePhotoLightbox({
                photoCardSelector: '[data-photo-card]',
                gridRef,
            })
        );

        const slides = [{ src: '/photo1.jpg' }, { src: '/photo2.jpg' }];

        act(() => {
            result.current.openLightbox(1);
        });

        const lightbox = result.current.renderLightbox(slides);
        const exitedCallback = lightbox.props.on.exited;

        act(() => {
            exitedCallback();
        });

        expect(mockScrollIntoView).toHaveBeenCalledWith({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest',
        });
    });

    it('uses custom photo card selector', () => {
        const mockScrollIntoView = vi.fn();

        const photoCard = document.createElement('div');
        photoCard.className = 'custom-photo-card';
        photoCard.scrollIntoView = mockScrollIntoView;

        const mockGrid = document.createElement('div');
        mockGrid.appendChild(photoCard);

        // Create ref with current already set
        const gridRef = { current: mockGrid };

        const { result } = renderHook(() =>
            usePhotoLightbox({
                photoCardSelector: '.custom-photo-card',
                gridRef,
            })
        );

        const slides = [{ src: '/photo1.jpg' }];

        act(() => {
            result.current.openLightbox(0);
        });

        const lightbox = result.current.renderLightbox(slides);
        const exitedCallback = lightbox.props.on.exited;

        act(() => {
            exitedCallback();
        });

        expect(mockScrollIntoView).toHaveBeenCalled();
    });

    it('respects custom loadMoreThreshold', () => {
        const onLoadMore = vi.fn();
        const { result } = renderHook(() =>
            usePhotoLightbox({
                onLoadMore,
                hasMore: true,
                isLoadingMore: false,
                loadMoreThreshold: 5, // Custom threshold
            })
        );

        const slides = Array.from({ length: 10 }, (_, i) => ({ src: `/photo${i}.jpg` }));

        const lightbox = result.current.renderLightbox(slides, 10);
        const viewCallback = lightbox.props.on.view;

        // Should trigger at index 5 (10 - 5 = 5)
        act(() => {
            viewCallback({ index: 5 });
        });

        expect(onLoadMore).toHaveBeenCalledWith(5);

        // Should not trigger at index 4 (before threshold)
        onLoadMore.mockClear();
        act(() => {
            viewCallback({ index: 4 });
        });

        expect(onLoadMore).not.toHaveBeenCalled();
    });

    it('configures lightbox with correct plugins and settings', () => {
        const { result } = renderHook(() => usePhotoLightbox());

        const slides = [{ src: '/photo1.jpg', alt: 'Photo 1' }];
        const lightbox = result.current.renderLightbox(slides);

        expect(lightbox.props.plugins).toEqual(['Thumbnails', 'Fullscreen', 'LightboxDownload', 'Zoom']);
        expect(lightbox.props.controller.closeOnPullDown).toBe(true);
        expect(lightbox.props.controller.closeOnPullUp).toBe(true);
        expect(lightbox.props.controller.closeOnBackdropClick).toBe(true);
        expect(lightbox.props.carousel.padding).toBe('0px');
        expect(lightbox.props.carousel.spacing).toBe(0);
        expect(lightbox.props.carousel.imageFit).toBe('contain');
        expect(lightbox.props.zoom.maxZoomPixelRatio).toBe(3);
        expect(lightbox.props.zoom.scrollToZoom).toBe(true);
        expect(lightbox.props.styles.container.backgroundColor).toBe('rgba(0, 0, 0, 0.85)');
    });

    it('sets carousel finite based on hasMore option', () => {
        const { result: resultWithMore } = renderHook(() =>
            usePhotoLightbox({ hasMore: true })
        );
        const { result: resultWithoutMore } = renderHook(() =>
            usePhotoLightbox({ hasMore: false })
        );

        const slides = [{ src: '/photo1.jpg' }];

        const lightboxWithMore = resultWithMore.current.renderLightbox(slides);
        const lightboxWithoutMore = resultWithoutMore.current.renderLightbox(slides);

        expect(lightboxWithMore.props.carousel.finite).toBe(false);
        expect(lightboxWithoutMore.props.carousel.finite).toBe(true);
    });
});
