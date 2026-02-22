import { useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download as DownloadIcon, AlertCircle } from 'lucide-react';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { PublicGalleryHero } from '../components/public-gallery/PublicGalleryHero';
import { PublicGalleryPhotoSection } from '../components/public-gallery/PublicGalleryPhotoSection';
import { usePhotoLightbox } from '../hooks/usePhotoLightbox';
import { usePublicGallery } from '../hooks';
import { usePublicGalleryGrid } from '../hooks/usePublicGalleryGrid';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const PublicGallerySkeleton = () => (
    <div className="min-h-screen bg-surface dark:bg-surface-foreground/5" data-testid="skeleton-loader">
        <div className="h-screen bg-surface-foreground/10 dark:bg-surface/10 animate-pulse flex items-center justify-center">
            <div className="text-center space-y-4">
                <div className="h-4 w-32 bg-surface-foreground/20 dark:bg-surface/20 rounded mx-auto" />
                <div className="h-12 w-80 bg-surface-foreground/20 dark:bg-surface/20 rounded mx-auto" />
                <div className="h-4 w-48 bg-surface-foreground/20 dark:bg-surface/20 rounded mx-auto" />
            </div>
        </div>

        <div className="w-full px-4 sm:px-6 lg:px-10 py-16">
            <div className="bg-surface-foreground/5 rounded-2xl p-6 border border-border">
                <div className="h-8 w-40 bg-surface-foreground/20 dark:bg-surface/20 rounded mb-6 animate-pulse" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div
                            key={i}
                            className="aspect-4/3 bg-surface-foreground/10 dark:bg-surface/10 rounded-xl animate-pulse"
                            style={{ animationDelay: `${i * 100}ms` }}
                        />
                    ))}
                </div>
            </div>
        </div>
    </div>
);

const PublicGalleryError = ({ error }: { error: string }) => (
    <div className="min-h-screen bg-surface dark:bg-surface-foreground/5">
        <div className="container mx-auto px-4 py-16">
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <AlertCircle className="w-16 h-16 text-danger mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-text dark:text-accent-foreground mb-2">
                        Gallery Not Available
                    </h1>
                    <p className="text-muted dark:text-text">{error}</p>
                </div>
            </div>
        </div>
    </div>
);

export const PublicGalleryPage = () => {
    const { shareId } = useParams<{ shareId: string }>();
    const { gallery, photos, isLoading, isLoadingMore, hasMore, error, loadMorePhotos } =
        usePublicGallery({ shareId });

    const observerTargetRef = useRef<HTMLDivElement | null>(null);
    const loadMorePhotosRef = useRef<(() => void) | undefined>(undefined);

    const { gridDensity, gridLayout, gridRef, gridClassNames, setGridMode, setLayoutMode, touchHandlers } =
        usePublicGalleryGrid({ photos });

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
        return <PublicGallerySkeleton />;
    }

    if (error) {
        return <PublicGalleryError error={error} />;
    }

    return (
        <div className="min-h-screen bg-surface dark:bg-surface-foreground/5 text-text dark:text-accent-foreground">
            <div className="fixed top-6 right-6 z-30">
                <ThemeSwitch />
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
