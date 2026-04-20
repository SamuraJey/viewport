import type { MutableRefObject, TouchEventHandler } from 'react';
import { Heart, ImageOff, Loader2 } from 'lucide-react';
import { LazyImage } from '../LazyImage';
import { PublicGalleryGridControls } from './PublicGalleryGridControls';
import type { PublicGridDensity, PublicGridLayout } from '../../hooks/usePublicGalleryGrid';
import { getAccessiblePhotoName } from '../../lib/accessibility';
import type { PublicPhoto, SelectionSession } from '../../types';

interface PublicGalleryPhotoSectionProps {
  photos: PublicPhoto[];
  totalPhotos: number;
  displayedPhotos: number;
  sectionTitle?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  gridClassNames: string;
  gridLayout: PublicGridLayout;
  gridDensity: PublicGridDensity;
  gridRef: MutableRefObject<HTMLDivElement | null>;
  getAspectRatioHint: (photoId: string) => number;
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
    canMutate: boolean;
    allowPhotoComments: boolean;
    session: SelectionSession | null;
    commentsByPhotoId: Record<string, string | null>;
    onTogglePhoto: (photoId: string) => void;
    onUpdatePhotoComment: (photoId: string, comment: string) => void;
  };
}

export const PublicGalleryPhotoSection = ({
  photos,
  totalPhotos,
  displayedPhotos,
  sectionTitle = 'Photos',
  emptyTitle = 'No photos in this gallery',
  emptyDescription = 'This gallery appears to be empty. Check back later for updates.',
  gridClassNames,
  gridLayout,
  gridDensity,
  gridRef,
  getAspectRatioHint,
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
    <section
      id="gallery-content"
      tabIndex={-1}
      className="space-y-6 pt-1 sm:space-y-8"
      {...touchHandlers}
      style={{ touchAction: 'pan-y' }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-text sm:text-3xl">
          {sectionTitle}{' '}
          <span className="text-lg font-medium text-muted">
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

      {photos.length > 0 ? (
        <>
          <div className={gridClassNames} ref={gridRef}>
            {photos.map((photo, index) => {
              const accessiblePhotoName = getAccessiblePhotoName({
                displayName: photo.filename,
                filename: photo.filename,
              });
              const isSelected = selection?.selectedIds.has(photo.photo_id) ?? false;
              const selectionButtonLabel = isSelected
                ? `Remove ${accessiblePhotoName} from favorites`
                : `Add ${accessiblePhotoName} to favorites`;
              const isSelectionLocked = Boolean(selection?.session && !selection.canMutate);

              return (
                <div
                  key={photo.photo_id}
                  className={`pg-card group relative overflow-hidden rounded-xl transition-all duration-300 ${
                    gridLayout === 'uniform' ? 'pg-card--uniform' : ''
                  } ${isSelected ? 'ring-2 ring-accent/45 ring-offset-2 ring-offset-surface' : 'hover:shadow-lg'}`}
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
                      disabled={isSelectionLocked}
                      className={`absolute top-3 right-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-sm transition-all duration-200 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                        isSelected
                          ? 'border-accent/50 bg-accent text-accent-foreground opacity-100 shadow-lg'
                          : 'border-white/45 bg-black/20 text-white opacity-70 hover:bg-black/35 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'
                      } ${isSelectionLocked ? 'cursor-not-allowed opacity-70' : ''}`}
                      aria-label={selectionButtonLabel}
                      aria-pressed={isSelected}
                      title={isSelected ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Heart className={`h-4 w-4 ${isSelected ? 'fill-current' : ''}`} />
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => onOpenPhoto(index)}
                    className="block h-full w-full cursor-pointer border-0 bg-transparent p-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    aria-label={accessiblePhotoName}
                  >
                    <LazyImage
                      src={photo.thumbnail_url}
                      alt={accessiblePhotoName}
                      className={`pg-card__media transition-transform duration-300 group-hover:scale-[1.01] ${
                        gridLayout === 'uniform' ? 'pg-card__media--uniform' : ''
                      }`}
                      imgClassName="pg-card__img"
                      aspectRatioHint={
                        gridLayout === 'masonry' ? getAspectRatioHint(photo.photo_id) : undefined
                      }
                      objectFit={gridLayout === 'uniform' ? 'contain' : 'cover'}
                    />
                  </button>
                  {selection?.enabled && selection.allowPhotoComments && isSelected ? (
                    <div className="absolute inset-x-2 bottom-2 z-20">
                      <label htmlFor={`selection-comment-${photo.photo_id}`} className="sr-only">
                        Comment for {accessiblePhotoName}
                      </label>
                      <textarea
                        id={`selection-comment-${photo.photo_id}`}
                        key={`${photo.photo_id}-${selection.commentsByPhotoId[photo.photo_id] ?? ''}`}
                        defaultValue={selection.commentsByPhotoId[photo.photo_id] ?? ''}
                        placeholder="Comment for this photo"
                        disabled={!selection.canMutate}
                        onClick={(event) => event.stopPropagation()}
                        onBlur={(event) =>
                          selection.onUpdatePhotoComment(photo.photo_id, event.currentTarget.value)
                        }
                        className="min-h-14 w-full resize-none rounded-xl border border-border/40 bg-surface/92 px-3 py-2 text-xs text-text outline-none focus:border-accent/50 disabled:cursor-not-allowed disabled:opacity-70"
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div ref={observerTargetRef} className="mt-4 h-4" />

          {isLoadingMore && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <span className="ml-3 font-medium text-muted">Loading more photos...</span>
            </div>
          )}

          {!hasMore && photos.length > 50 && (
            <div className="py-12 text-center text-sm font-medium text-muted">
              All photos loaded ({photos.length} total)
            </div>
          )}
        </>
      ) : (
        <div className="rounded-3xl border border-dashed border-border/50 bg-surface-1/20 py-20 text-center dark:border-border/10">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-foreground/10">
            <ImageOff className="h-8 w-8 text-muted" />
          </div>
          <h3 className="text-xl font-semibold text-text">{emptyTitle}</h3>
          <p className="mx-auto mt-2 max-w-sm text-muted">{emptyDescription}</p>
        </div>
      )}
    </section>
  );
};
