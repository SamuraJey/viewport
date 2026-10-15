import { memo, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  SquareCheck,
  Download,
  ImageOff,
  LoaderCircle,
  Play,
  Square,
  Star,
  Trash2,
  VideoOff,
} from 'lucide-react';
import type { GalleryPhoto } from '../../types';
import { PhotoRotationButtons } from './PhotoRotationButtons';
import { canRotatePhoto, isRotationPending, normalizeRotation } from '../../lib/photoRotation';
import { AppBadge } from '../ui/AppBadge';
import { getAccessiblePhotoName } from '../../lib/accessibility';
import { formatDuration } from '../../lib/utils';
import { observeViewportVisibility } from '../../lib/observeNearViewport';
import { OwnerPhotoThumbnail } from './OwnerPhotoThumbnail';

interface PhotoCardProps {
  photo: GalleryPhoto;
  previewUrl?: string;
  onRotatePhoto?: (photoId: string, direction: -90 | 90 | 'reset' | 'retry') => void;
  index: number;
  isSelectionMode: boolean;
  isSelected: boolean;
  isCover: boolean;
  onToggleSelection: (photoId: string, isShiftKey: boolean) => void;
  onOpenPhoto: (index: number) => void;
  onSetCover: (photoId: string) => void;
  onClearCover: () => void;
  onRenamePhoto: (photoId: string, filename: string) => void;
  onDownloadPhoto: (photoId: string) => void;
  onDeletePhoto: (photoId: string) => void;
}

const PhotoCardComponent = ({
  photo,
  previewUrl,
  onRotatePhoto,
  index,
  isSelectionMode,
  isSelected,
  isCover,
  onToggleSelection,
  onOpenPhoto,
  onSetCover,
  onClearCover,
  onRenamePhoto,
  onDownloadPhoto,
  onDeletePhoto,
}: PhotoCardProps) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const hasVisibleActions = isNearViewport || isFocused;
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    return observeViewportVisibility(card, setIsNearViewport);
  }, []);
  const src = previewUrl ?? photo.thumbnail_url;
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({ src, width: 0, height: 0 });
  const pending = isRotationPending(photo);
  const delta = pending
    ? normalizeRotation((photo.requested_rotation ?? 0) - (photo.rotation ?? 0))
    : 0;
  useEffect(() => {
    const element = areaRef.current;
    if (!element || !delta || delta % 180 === 0 || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setArea((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [delta]);
  let scale = 1;
  if (delta % 180 && area.width && area.height) {
    const width = photo.width || (naturalSize.src === src ? naturalSize.width : 0) || 1;
    const height = photo.height || (naturalSize.src === src ? naturalSize.height : 0) || 1;
    const fit = Math.min(area.width / width, area.height / height);
    scale = Math.min(area.width / (height * fit), area.height / (width * fit));
  }
  const overlayButton =
    'bg-white/20 text-white enabled:hover:bg-white/40 focus-visible:outline-white';
  const cardButton = `flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white transition-colors @min-[300px]/photo:h-12 @min-[300px]/photo:w-12 @min-[400px]/photo:h-16 @min-[400px]/photo:w-16 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`;

  const captureNaturalSize = useCallback(
    (width: number, height: number) => {
      setNaturalSize((previous) =>
        previous.src === src && previous.width === width && previous.height === height
          ? previous
          : { src, width, height },
      );
    },
    [src],
  );

  const handleDownload = (e: MouseEvent) => {
    e.stopPropagation();
    onDownloadPhoto(photo.id);
  };

  const accessiblePhotoName = getAccessiblePhotoName({
    displayName: photo.filename,
    filename: photo.filename,
  });

  return (
    <div
      ref={cardRef}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsFocused(false);
      }}
      onPointerEnter={() => setIsNearViewport(true)}
      data-photo-card
      className={`owner-photo-card group @container/photo bg-surface dark:bg-surface-dark-1 flex flex-col relative overflow-hidden rounded-2xl border shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-md focus-within:shadow-md ${
        isCover
          ? 'border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/20 dark:ring-amber-500/20'
          : isSelected
            ? 'border-accent/60 ring-2 ring-accent/20'
            : 'border-border/50 dark:border-border/40 dark:hover:border-accent/50 dark:focus-within:border-accent/50'
      }`}
    >
      {/* Cover indicator */}
      {isCover && (
        <AppBadge
          tone="warning"
          icon={<Star className="h-3 w-3 fill-current" />}
          className="absolute top-3 right-3 z-10"
          aria-label="Cover photo"
        >
          Cover
        </AppBadge>
      )}

      {/* Selection checkbox */}
      {isSelectionMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelection(photo.id, e.shiftKey);
          }}
          className={`absolute top-3 left-3 z-10 p-1.5 rounded-xl transition-all duration-200 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-[3px] focus-visible:ring-offset-surface ${
            isSelected
              ? 'bg-accent text-accent-foreground shadow-md scale-110'
              : 'bg-surface/90 dark:bg-surface-dark-1/90 text-muted hover:text-text shadow-sm hover:scale-105 backdrop-blur-md'
          }`}
          title={isSelected ? 'Deselect' : 'Select'}
          aria-pressed={isSelected}
        >
          {isSelected ? <SquareCheck className="w-5 h-5" /> : <Square className="w-5 h-5" />}
        </button>
      )}

      {/* Image area */}
      <div
        ref={areaRef}
        className="relative h-64 sm:h-72 md:h-80 bg-surface-1 dark:bg-surface-dark-1 overflow-hidden"
      >
        {/* Status badge — shown for non-successful media */}
        {photo.status === 'processing' && (
          <AppBadge
            tone="warning"
            icon={<LoaderCircle className="h-3 w-3 animate-spin" />}
            className="absolute top-3 right-3 z-10"
            aria-label="Photo is processing"
          >
            Processing
          </AppBadge>
        )}
        {photo.status === 'pending' && (
          <AppBadge
            tone="info"
            icon={<LoaderCircle className="h-3 w-3 animate-spin" />}
            className="absolute top-3 right-3 z-10"
            aria-label="Photo upload is pending"
          >
            Pending
          </AppBadge>
        )}
        {photo.status === 'failed' && (
          <AppBadge
            tone="danger"
            icon={
              photo.media_type === 'video' ? (
                <VideoOff className="h-3 w-3" />
              ) : (
                <ImageOff className="h-3 w-3" />
              )
            }
            className="absolute top-3 right-3 z-10"
            aria-label="Photo processing failed"
          >
            Failed
          </AppBadge>
        )}

        {/* Video play badge — shown only for successful videos */}
        {photo.media_type === 'video' && photo.status === 'successful' && (
          <div className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="flex items-center justify-center h-14 w-14 rounded-full bg-black/60 text-white backdrop-blur-md shadow-lg">
              <Play className="h-6 w-6 fill-current ml-0.5" />
            </div>
          </div>
        )}

        {/* Duration badge — shown for successful videos with duration */}
        {photo.media_type === 'video' &&
          photo.status === 'successful' &&
          photo.duration_ms != null && (
            <div className="absolute bottom-3 right-3 z-10 px-2 py-0.5 rounded-md bg-black/70 text-white text-xs font-medium backdrop-blur-md shadow">
              {formatDuration(photo.duration_ms)}
            </div>
          )}

        {/* Photo - takes full image area */}
        <button
          type="button"
          onClick={(e) => {
            if (isSelectionMode) {
              onToggleSelection(photo.id, e.shiftKey);
              return;
            }
            onOpenPhoto(index);
          }}
          className="w-full h-full p-0 border-0 bg-transparent cursor-pointer absolute inset-0 rounded-2xl focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-accent"
          aria-label={accessiblePhotoName}
          title={
            isSelectionMode
              ? 'Click to toggle selection. Use Shift+Click to select range.'
              : 'Click to view'
          }
        >
          <OwnerPhotoThumbnail
            key={JSON.stringify([src, photo.url, photo.status === 'failed', photo.media_type])}
            src={src}
            fallbackSrc={photo.media_type === 'video' ? undefined : photo.url}
            alt={accessiblePhotoName}
            index={index}
            isVideo={photo.media_type === 'video'}
            failed={photo.status === 'failed'}
            transform={!previewUrl && delta ? `rotate(${delta}deg) scale(${scale})` : undefined}
            fallbackTransform={delta ? `rotate(${delta}deg) scale(${scale})` : undefined}
            onNaturalSize={
              delta % 180 && (!photo.width || !photo.height) ? captureNaturalSize : undefined
            }
          />
        </button>
        {hasVisibleActions && (
          <div className="absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-center gap-x-0 gap-y-2 bg-linear-to-t from-black/80 to-transparent px-0 pb-4 pt-6 opacity-100 @min-[260px]/photo:gap-x-1 @min-[260px]/photo:px-2 @min-[300px]/photo:gap-x-2 @min-[400px]/photo:gap-x-3.5 can-hover:opacity-0 can-hover:group-hover:opacity-100 can-hover:group-focus-within:opacity-100">
            <button
              type="button"
              aria-label={isCover ? 'Remove cover' : 'Set as cover'}
              title={isCover ? 'Remove cover' : 'Set as cover'}
              aria-pressed={isCover}
              onClick={(event) => {
                event.stopPropagation();
                if (isCover) onClearCover();
                else onSetCover(photo.id);
              }}
              className={`${cardButton} focus-visible:outline-amber-500 ${
                isCover ? 'bg-amber-500/80 hover:bg-amber-500' : 'bg-white/20 hover:bg-amber-500/80'
              }`}
            >
              <Star
                className={`h-5 w-5 @min-[400px]/photo:h-6 @min-[400px]/photo:w-6 ${isCover ? 'fill-current' : ''}`}
              />
            </button>
            {onRotatePhoto && (
              <PhotoRotationButtons
                disabled={!canRotatePhoto(photo)}
                variant="card"
                className={overlayButton}
                onRotate={(direction) => onRotatePhoto(photo.id, direction)}
              />
            )}
            <button
              type="button"
              aria-label="Download photo"
              title={pending ? 'Rotation is saving' : 'Download photo'}
              disabled={pending}
              onClick={handleDownload}
              className={`${cardButton} bg-white/20 enabled:hover:bg-green-500/80 focus-visible:outline-green-500`}
            >
              <Download className="h-5 w-5 @min-[400px]/photo:h-6 @min-[400px]/photo:w-6" />
            </button>
            <button
              type="button"
              aria-label="Delete photo"
              title="Delete photo"
              onClick={(event) => {
                event.stopPropagation();
                onDeletePhoto(photo.id);
              }}
              className={`${cardButton} bg-white/20 hover:bg-red-500/80 focus-visible:outline-red-500`}
            >
              <Trash2 className="h-5 w-5 @min-[400px]/photo:h-6 @min-[400px]/photo:w-6" />
            </button>
          </div>
        )}
      </div>

      {/* Caption below the image */}
      <div className="px-4 py-3 border-t border-border/50 dark:border-border/40 bg-surface dark:bg-surface-dark-1 z-10">
        <button
          type="button"
          onClick={() => onRenamePhoto(photo.id, photo.filename)}
          aria-label={`Rename ${photo.filename}`}
          title="Rename photo"
          className="min-h-11 w-full truncate rounded-lg text-center text-sm font-medium text-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        >
          {photo.filename}
        </button>
        {pending && (
          <span
            role="status"
            className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted"
          >
            <LoaderCircle className="h-3 w-3 animate-spin motion-reduce:animate-none" />
            Saving rotation
          </span>
        )}
        {photo.rotation_status === 'failed' && (
          <div
            role="status"
            className="mt-1 flex items-center justify-center gap-2 text-xs text-danger"
          >
            Rotation not saved
            <button
              type="button"
              aria-label="Retry rotation"
              className="min-h-11 px-2 font-semibold underline focus-visible:outline focus-visible:outline-2"
              onClick={() => onRotatePhoto?.(photo.id, 'retry')}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const PhotoCard = memo(PhotoCardComponent);
