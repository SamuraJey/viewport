import type { MutableRefObject, TouchEventHandler } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { LazyImage } from '../LazyImage';
import { PublicGalleryGridControls } from './PublicGalleryGridControls';
import type { PublicGridDensity, PublicGridLayout } from '../../hooks/usePublicGalleryGrid';
import type { PublicPhoto } from '../../services/shareLinkService';

interface PublicGalleryPhotoSectionProps {
  photos: PublicPhoto[];
  totalPhotos: number;
  gridClassNames: string;
  gridLayout: PublicGridLayout;
  gridDensity: PublicGridDensity;
  gridRef: MutableRefObject<HTMLDivElement | null>;
  observerTargetRef: MutableRefObject<HTMLDivElement | null>;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLayoutChange: (layout: PublicGridLayout) => void;
  onDensityChange: (density: PublicGridDensity) => void;
  onOpenPhoto: (index: number) => void;
  touchHandlers: {
    onTouchStart: TouchEventHandler<HTMLDivElement>;
    onTouchMove: TouchEventHandler<HTMLDivElement>;
    onTouchEnd: TouchEventHandler<HTMLDivElement>;
    onTouchCancel: TouchEventHandler<HTMLDivElement>;
  };
}

export const PublicGalleryPhotoSection = ({
  photos,
  totalPhotos,
  gridClassNames,
  gridLayout,
  gridDensity,
  gridRef,
  observerTargetRef,
  isLoadingMore,
  hasMore,
  onLayoutChange,
  onDensityChange,
  onOpenPhoto,
  touchHandlers,
}: PublicGalleryPhotoSectionProps) => {
  return (
    <div
      className="bg-surface-foreground/5 rounded-2xl p-6 border border-border"
      {...touchHandlers}
      style={{ touchAction: 'pan-y' }}
    >
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-semibold text-text dark:text-accent-foreground">
          Photos ({totalPhotos})
        </h2>

        <PublicGalleryGridControls
          gridLayout={gridLayout}
          gridDensity={gridDensity}
          onLayoutChange={onLayoutChange}
          onDensityChange={onDensityChange}
        />
      </div>

      {photos.length > 0 ? (
        <>
          <div className={gridClassNames} ref={gridRef}>
            {photos.map((photo, index) => (
              <div
                key={photo.photo_id}
                className={`pg-card relative group ${gridLayout === 'uniform' ? 'pg-card--uniform' : ''}`}
                data-testid="public-batch"
              >
                <button
                  onClick={() => onOpenPhoto(index)}
                  className="w-full p-0 border-0 bg-transparent cursor-pointer block"
                  aria-label={`Photo ${photo.photo_id}`}
                >
                  <LazyImage
                    src={photo.thumbnail_url}
                    alt={`Photo ${photo.photo_id}`}
                    className={`pg-card__media ${gridLayout === 'uniform' ? 'pg-card__media--uniform' : ''}`}
                    imgClassName="pg-card__img"
                    objectFit={gridLayout === 'uniform' ? 'contain' : 'cover'}
                    width={photo.width}
                    height={photo.height}
                  />
                </button>
              </div>
            ))}
          </div>

          <div ref={observerTargetRef} className="h-4 mt-4" />

          {isLoadingMore && (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              <span className="ml-2 text-muted">Loading more photos...</span>
            </div>
          )}

          {!hasMore && photos.length > 50 && (
            <div className="text-center py-8 text-muted text-sm">
              All photos loaded ({photos.length} total)
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 border-2 border-dashed border-border dark:border-border/10 rounded-lg">
          <ImageOff className="mx-auto h-12 w-12 text-muted" />
          <h3 className="mt-4 text-lg font-medium text-muted dark:text-muted-foreground">
            No photos in this gallery
          </h3>
          <p className="mt-2 text-sm text-muted">This gallery appears to be empty.</p>
        </div>
      )}
    </div>
  );
};
