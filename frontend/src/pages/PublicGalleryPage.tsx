import { useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download as DownloadIcon } from 'lucide-react';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { PublicGalleryHero } from '../components/public-gallery/PublicGalleryHero';
import { PublicGalleryPhotoSection } from '../components/public-gallery/PublicGalleryPhotoSection';
import {
    PublicGalleryError,
} from '../components/public-gallery/PublicGalleryStates';
import { usePhotoLightbox } from '../hooks/usePhotoLightbox';
import { usePublicGallery } from '../hooks';
import { usePublicGalleryGrid } from '../hooks/usePublicGalleryGrid';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const PublicGalleryPage = () => {
    const { shareId } = useParams<{ shareId: string }>();
    const { gallery, photos, isLoading, isLoadingMore, hasMore, error, loadMorePhotos } =
        usePublicGallery({ shareId });

    const observerTargetRef = useRef<HTMLDivElement | null>(null);
    const loadMorePhotosRef = useRef<(() => void) | undefined>(undefined);

    const {
        gridDensity,
        gridLayout,
        gridRef,
        gridClassNames,
        setGridMode,
        setLayoutMode,
        touchHandlers,
    } = usePublicGalleryGrid({ photos });

    const { openLightbox, renderLightbox } = usePhotoLightbox({
        photoCardSelector: '.pg-card',
        gridRef,
        onLoadMore: () => loadMorePhotosRef.current?.(),
        hasMore,
        isLoadingMore,
        loadMoreThreshold: 10,
    });

    useEffect(() => {
        loadMorePhotosRef.current = loadMorePhotos;
    }, [loadMorePhotos]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
                    loadMorePhotos();
                }
            },
            {
                threshold: 0.1,
                rootMargin: '400px',
            },
        );

        if (observerTargetRef.current) {
            observer.observe(observerTargetRef.current);
        }

        return () => {
            observer.disconnect();
        };
    }, [hasMore, isLoadingMore, loadMorePhotos]);

    const handleDownloadAll = () => {
        if (!shareId) return;
        window.open(`${API_BASE_URL}/s/${shareId}/download/all`, '_blank');
    };

    const lightboxSlides = useMemo(
        () =>
            photos.map((photo) => ({
                src: photo.full_url,
                thumbnailSrc: photo.thumbnail_url,
                width: photo.width || undefined,
                height: photo.height || undefined,
                alt: photo.filename || `Photo ${photo.photo_id}`,
                download: photo.full_url,
                downloadFilename: photo.filename || `photo-${photo.photo_id}.jpg`,
            })),
        [photos],
    );

    if (isLoading) {
        return null;
    }

    if (error) {
        return <PublicGalleryError error={error} />;
    }

    return (
        <div className="min-h-screen bg-surface dark:bg-surface-foreground/5 text-text dark:text-accent-foreground">
            <div className="fixed top-6 right-6 z-30">
                <ThemeSwitch variant="inline" />
            </div>

            <PublicGalleryHero gallery={gallery} />

            <div id="gallery-content" className="w-full px-4 sm:px-6 lg:px-10 py-16">
                {photos.length > 0 && (
                    <div className="mb-8 text-center">
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleDownloadAll}
                            className="bg-accent hover:bg-accent/90 text-accent-foreground px-6 py-3 rounded-lg font-medium shadow-sm hover:shadow-md transition-all duration-200 inline-flex items-center gap-2"
                        >
                            <DownloadIcon className="w-5 h-5" />
                            Download All Photos
                        </motion.button>
                    </div>
                )}

                <PublicGalleryPhotoSection
                    photos={photos}
                    totalPhotos={gallery?.total_photos ?? photos.length}
                    gridClassNames={gridClassNames}
                    gridLayout={gridLayout}
                    gridDensity={gridDensity}
                    gridRef={gridRef}
                    observerTargetRef={observerTargetRef}
                    isLoadingMore={isLoadingMore}
                    hasMore={hasMore}
                    onLayoutChange={setLayoutMode}
                    onDensityChange={setGridMode}
                    onOpenPhoto={openLightbox}
                    touchHandlers={touchHandlers}
                />

                <div className="text-center mt-12 text-muted dark:text-text text-sm">
                    <p>Powered by Viewport - Your Photo Gallery Solution</p>
                </div>
            </div>

            {renderLightbox(lightboxSlides, photos.length)}
        </div>
    );
};
