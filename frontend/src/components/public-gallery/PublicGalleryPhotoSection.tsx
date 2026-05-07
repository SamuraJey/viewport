import type { MutableRefObject, TouchEventHandler } from 'react';
import { useEffect, useRef } from 'react';
import { Heart, ImageOff, Loader2, MessageSquare } from 'lucide-react';
import type { PublicGridDensity, PublicGridLayout } from '../../hooks/usePublicGalleryGrid';
import { getAccessiblePhotoName } from '../../lib/accessibility';
import type { PublicPhoto, SelectionSession } from '../../types';
import { LazyImage } from '../LazyImage';
import { AppPopover } from '../ui';
import { PublicGalleryGridControls } from './PublicGalleryGridControls';

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
  getAspectRatioHint: (photo: PublicPhoto) => number;
  observerTargetRef: MutableRefObject<HTMLDivElement | null>;
  isLoading?: boolean;
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
    canMutate: boolean;
    allowPhotoComments: boolean;
    session: SelectionSession | null;
    commentsByPhotoId: Record<string, string | null>;
    onTogglePhoto: (photoId: string) => void;
    onUpdatePhotoComment: (photoId: string, comment: string) => void;
  };
}

interface PhotoCommentPanelProps {
  photoId: string;
  accessiblePhotoName: string;
  photoComment: string;
  hasComment: boolean;
  disabled: boolean;
  onUpdatePhotoComment?: (photoId: string, comment: string) => void;
}

const PhotoCommentPanel = ({
  photoId,
  accessiblePhotoName,
  photoComment,
  hasComment,
  disabled,
  onUpdatePhotoComment,
}: PhotoCommentPanelProps) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (disabled) {
      return;
    }

    textareaRef.current?.focus({ preventScroll: true });
  }, [disabled]);

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Photo note</p>
        <p className="mt-1 text-xs text-muted">
          {hasComment
            ? 'Refine the note for the photographer.'
            : 'Add context for the photographer.'}
        </p>
      </div>
      <label htmlFor={`selection-comment-${photoId}`} className="sr-only">
        Comment for {accessiblePhotoName}
      </label>
      <textarea
        id={`selection-comment-${photoId}`}
        ref={textareaRef}
        key={`${photoId}-${photoComment}`}
        defaultValue={photoComment}
        placeholder="Comment for this photo"
        disabled={disabled}
        onClick={(event) => event.stopPropagation()}
        onBlur={(event) => onUpdatePhotoComment?.(photoId, event.currentTarget.value)}
        className="min-h-28 w-full resize-none rounded-xl border border-border/40 bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent/50 disabled:cursor-not-allowed disabled:opacity-70"
      />
    </div>
  );
};

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
  isLoading = false,
  isLoadingMore,
  hasMore,
  onLayoutChange,
  onDensityChange,
  onOpenPhoto,
  touchHandlers,
  selection,
}: PublicGalleryPhotoSectionProps) => {
  const hasSelectionEnabled = selection?.enabled ?? false;
  const photoCountLabel =
    displayedPhotos === totalPhotos
      ? `(${displayedPhotos})`
      : `(${displayedPhotos} / ${totalPhotos})`;

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
          {sectionTitle} <span className="text-lg font-medium text-muted">{photoCountLabel}</span>
        </h2>

        <PublicGalleryGridControls
          gridLayout={gridLayout}
          gridDensity={gridDensity}
          onLayoutChange={onLayoutChange}
          onDensityChange={onDensityChange}
        />
      </div>

      {isLoading ? (
        <div className="flex min-h-80 items-center justify-center rounded-3xl border border-border/40 bg-surface-1/25 text-sm font-medium text-muted dark:border-border/20">
          <Loader2 className="mr-3 h-6 w-6 animate-spin text-accent" />
          Loading gallery photos...
        </div>
      ) : photos.length > 0 ? (
        <>
          <div className={gridClassNames} ref={gridRef}>
            {photos.map((photo, index) => {
              const accessiblePhotoName = getAccessiblePhotoName({
                displayName: photo.filename,
                filename: photo.filename,
              });
              const isUniformLayout = gridLayout === 'uniform';
              const photoComment = selection?.commentsByPhotoId[photo.photo_id] ?? '';
              const isSelected = selection?.selectedIds.has(photo.photo_id) ?? false;
              const hasComment = Boolean(photoComment.trim());
              const canMutateSelection = selection?.canMutate ?? false;
              const allowPhotoComments = selection?.allowPhotoComments ?? false;
              const selectionButtonLabel = isSelected
                ? `Remove ${accessiblePhotoName} from favorites`
                : `Add ${accessiblePhotoName} to favorites`;
              const isSelectionLocked = Boolean(selection?.session && !selection.canMutate);
              const cardClassName = isSelected
                ? 'ring-2 ring-accent/45 ring-offset-2 ring-offset-surface'
                : 'hover:shadow-lg';
              const imageWrapperClassName = isUniformLayout ? 'pg-card--uniform' : '';
              const imageClassName = isUniformLayout ? 'pg-card__media--uniform' : '';

              return (
                <div
                  key={photo.photo_id}
                  className={`pg-card group relative overflow-visible transition-all duration-300 ${cardClassName}`}
                  data-testid="public-batch"
                  data-photo-id={photo.photo_id}
                >
                  <div className={`relative overflow-hidden rounded-xl ${imageWrapperClassName}`}>
                    {hasSelectionEnabled ? (
                      <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            selection?.onTogglePhoto(photo.photo_id);
                          }}
                          disabled={isSelectionLocked}
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-sm transition-all duration-200 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
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

                        {allowPhotoComments && isSelected ? (
                          <AppPopover
                            className="relative"
                            buttonAriaLabel={`${hasComment ? 'Edit' : 'Add'} a note for ${accessiblePhotoName}`}
                            buttonClassName={(open) =>
                              `inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/45 bg-black/25 text-white backdrop-blur-sm transition-all duration-200 hover:bg-black/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                                open || hasComment
                                  ? 'opacity-100 shadow-lg'
                                  : 'opacity-85 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'
                              }`
                            }
                            buttonContent={(open) => (
                              <span className="relative inline-flex">
                                <MessageSquare className="h-4 w-4" />
                                {hasComment && !open ? (
                                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent" />
                                ) : null}
                              </span>
                            )}
                            anchor={{ to: 'bottom end', gap: '10px' }}
                            panelClassName="w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-border/40 bg-surface/98 p-3 shadow-2xl backdrop-blur dark:bg-surface-dark"
                            panel={
                              <PhotoCommentPanel
                                photoId={photo.photo_id}
                                accessiblePhotoName={accessiblePhotoName}
                                photoComment={photoComment}
                                hasComment={hasComment}
                                disabled={!canMutateSelection}
                                onUpdatePhotoComment={selection?.onUpdatePhotoComment}
                              />
                            }
                          />
                        ) : null}
                      </div>
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
                        className={`pg-card__media transition-transform duration-300 group-hover:scale-[1.01] ${imageClassName}`}
                        imgClassName="pg-card__img"
                        aspectRatioHint={isUniformLayout ? undefined : getAspectRatioHint(photo)}
                        objectFit={isUniformLayout ? 'contain' : 'cover'}
                      />
                    </button>
                  </div>
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
