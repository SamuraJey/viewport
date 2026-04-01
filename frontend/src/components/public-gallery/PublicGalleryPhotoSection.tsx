import type { MutableRefObject, TouchEventHandler } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { LazyImage } from '../LazyImage';
import { PublicGalleryGridControls } from './PublicGalleryGridControls';
import type { PublicGridDensity, PublicGridLayout } from '../../hooks/usePublicGalleryGrid';
import type { PublicPhoto } from '../../services/shareLinkService';
import type { SelectionSession } from '../../types';

interface PublicGalleryPhotoSectionProps {
  photos: PublicPhoto[];
  totalPhotos: number;
  displayedPhotos: number;
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
  selection?: {
    enabled: boolean;
    selectedIds: Set<string>;
    selectedCount: number;
    limitEnabled: boolean;
    limitValue: number | null;
    selectedOnly: boolean;
    canMutate: boolean;
    allowPhotoComments: boolean;
    session: SelectionSession | null;
    commentsByPhotoId: Record<string, string | null>;
    onToggleSelectedOnly: () => void;
    onTogglePhoto: (photoId: string) => void;
    onUpdatePhotoComment: (photoId: string, comment: string) => void;
  };
}

export const PublicGalleryPhotoSection = ({
  photos,
  totalPhotos,
  displayedPhotos,
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
  selection,
}: PublicGalleryPhotoSectionProps) => {
  return (
    <div
      className="bg-surface-foreground/5 rounded-3xl p-6 sm:p-8 border border-border/50 shadow-xs"
      {...touchHandlers}
      style={{ touchAction: 'pan-y' }}
    >
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold text-text dark:text-accent-foreground flex items-center gap-2">
          Photos{' '}
          <span className="text-muted text-lg font-medium">
            ({displayedPhotos}
            {displayedPhotos !== totalPhotos ? ` / ${totalPhotos}` : ''})
          </span>
        </h2>

        <PublicGalleryGridControls
          gridLayout={gridLayout}
          gridDensity={gridDensity}
          onLayoutChange={onLayoutChange}
          onDensityChange={onDensityChange}
        />
      </div>

      {selection?.enabled ? (
        <div className="mb-6 rounded-2xl border border-border/50 bg-surface-1/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-text">
              Selected: {selection.selectedCount}
              {selection.limitEnabled && selection.limitValue ? ` / ${selection.limitValue}` : ''}
            </p>
            <button
              type="button"
              onClick={selection.onToggleSelectedOnly}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${selection.selectedOnly
                  ? 'bg-accent text-accent-foreground'
                  : 'border border-border/50 bg-surface text-text hover:border-accent/40'
                }`}
            >
              {selection.selectedOnly ? 'Show all photos' : 'Show selected only'}
            </button>
          </div>
        </div>
      ) : null}

      {photos.length > 0 ? (
        <>
          <div className={gridClassNames} ref={gridRef}>
            {photos.map((photo, index) => (
              <div
                key={photo.photo_id}
                className={`pg-card relative group overflow-hidden rounded-xl transition-all duration-200 hover:shadow-md ${gridLayout === 'uniform' ? 'pg-card--uniform' : ''}`}
                data-testid="public-batch"
                data-photo-id={photo.photo_id}
              >
                {selection?.enabled ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      selection.onTogglePhoto(photo.photo_id);
                    }}
                    disabled={selection.session && !selection.canMutate}
                    className={`absolute top-3 right-3 z-20 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${selection.selectedIds.has(photo.photo_id)
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-black/45 text-white hover:bg-black/60'
                      } ${selection.session && !selection.canMutate ? 'cursor-not-allowed opacity-70' : ''}`}
                  >
                    {selection.selectedIds.has(photo.photo_id) ? 'Selected' : 'Select'}
                  </button>
                ) : null}

                <button
                  onClick={() => onOpenPhoto(index)}
                  className="w-full h-full p-0 border-0 bg-transparent cursor-pointer block focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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

                {selection?.enabled &&
                  selection.allowPhotoComments &&
                  selection.selectedIds.has(photo.photo_id) ? (
                  <div className="absolute inset-x-2 bottom-2 z-20">
                    <textarea
                      key={`${photo.photo_id}-${selection.commentsByPhotoId[photo.photo_id] ?? ''}`}
                      defaultValue={selection.commentsByPhotoId[photo.photo_id] ?? ''}
                      placeholder="Comment for this photo"
                      disabled={!selection.canMutate}
                      onClick={(event) => event.stopPropagation()}
                      onBlur={(event) =>
                        selection.onUpdatePhotoComment(photo.photo_id, event.currentTarget.value)
                      }
                      className="min-h-14 w-full resize-none rounded-lg border border-border/40 bg-surface/90 px-2 py-1.5 text-xs text-text outline-none focus:border-accent/50 disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div ref={observerTargetRef} className="h-4 mt-4" />

          {isLoadingMore && (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              <span className="ml-3 text-muted font-medium">Loading more photos...</span>
            </div>
          )}

          {!hasMore && photos.length > 50 && (
            <div className="text-center py-12 text-muted text-sm font-medium">
              All photos loaded ({photos.length} total)
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-20 border-2 border-dashed border-border/50 dark:border-border/10 rounded-2xl bg-surface-1/30">
          <div className="w-16 h-16 mx-auto bg-surface-foreground/10 rounded-full flex items-center justify-center mb-4">
            <ImageOff className="h-8 w-8 text-muted" />
          </div>
          <h3 className="text-xl font-semibold text-text dark:text-accent-foreground">
            No photos in this gallery
          </h3>
          <p className="mt-2 text-muted max-w-sm mx-auto">
            This gallery appears to be empty. Check back later for updates.
          </p>
        </div>
      )}
    </div>
  );
};
