import { memo, useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  CheckSquare,
  Download,
  ImageOff,
  Pencil,
  Search,
  Square,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';
import type { GalleryPhoto } from '../../types';
import { getAccessiblePhotoName } from '../../lib/accessibility';

interface PhotoCardProps {
  photo: GalleryPhoto;
  index: number;
  isSelectionMode: boolean;
  isSelected: boolean;
  isCover: boolean;
  onToggleSelection: (photoId: string, isShiftKey: boolean) => void;
  onOpenPhoto: (index: number) => void;
  onSetCover: (photoId: string) => void;
  onClearCover: () => void;
  onRenamePhoto: (photoId: string, filename: string) => void;
  onDeletePhoto: (photoId: string) => void;
}

const PhotoCardComponent = ({
  photo,
  index,
  isSelectionMode,
  isSelected,
  isCover,
  onToggleSelection,
  onOpenPhoto,
  onSetCover,
  onClearCover,
  onRenamePhoto,
  onDeletePhoto,
}: PhotoCardProps) => {
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const imageElement = imageRef.current;
    if (imageElement?.complete) {
      setImageState(imageElement.naturalWidth > 0 ? 'loaded' : 'error');
      return;
    }

    setImageState('loading');
  }, [photo.thumbnail_url]);

  const handleDownload = async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(photo.url);
      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = photo.filename;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download photo:', error);
    }
  };

  const accessiblePhotoName = getAccessiblePhotoName({
    displayName: photo.filename,
    filename: photo.filename,
  });

  return (
    <div
      data-photo-card
      className={`group bg-surface dark:bg-surface-dark-1 flex flex-col relative overflow-hidden rounded-2xl border shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-md focus-within:shadow-md ${
        isCover
          ? 'border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/20 dark:ring-amber-500/20'
          : isSelected
            ? 'border-accent/60 ring-2 ring-accent/20'
            : 'border-border/50 dark:border-border/40 dark:hover:border-accent/50 dark:focus-within:border-accent/50'
      }`}
    >
      {/* Cover indicator */}
      {isCover && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/90 text-white text-xs font-semibold backdrop-blur-md shadow-lg">
          <Star className="h-3 w-3 fill-current" />
          Cover
        </div>
      )}

      {/* Selection checkbox */}
      {isSelectionMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelection(photo.id, e.shiftKey);
          }}
          className={`absolute top-3 left-3 z-10 p-1.5 rounded-xl transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
            isSelected
              ? 'bg-accent text-accent-foreground shadow-md scale-110'
              : 'bg-surface/90 dark:bg-surface-dark-1/90 text-muted hover:text-text shadow-sm hover:scale-105 backdrop-blur-md'
          }`}
          title={isSelected ? 'Deselect' : 'Select'}
          aria-pressed={isSelected}
        >
          {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
        </button>
      )}

      {/* Image area */}
      <div className="relative h-64 sm:h-72 md:h-80 bg-surface-1 dark:bg-surface-dark-1 overflow-hidden">
        {/* Action Panel - overlay at the bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-linear-to-t from-black/80 via-black/40 to-transparent transition-all duration-200 z-20 flex items-center justify-center gap-2 opacity-0 pointer-events-none translate-y-4 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenPhoto(index);
            }}
            className="p-2.5 rounded-xl bg-white/20 hover:bg-white/40 text-white backdrop-blur-md transition-all duration-200 hover:scale-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
            title="Open photo"
            aria-label="Open photo"
          >
            <Search className="h-4 w-4" />
          </button>
          {isCover ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClearCover();
              }}
              className="p-2.5 rounded-xl bg-amber-500/80 hover:bg-amber-500 text-white backdrop-blur-md transition-all duration-200 hover:scale-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
              title="Remove cover"
              aria-label="Remove cover"
            >
              <StarOff className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetCover(photo.id);
              }}
              className="p-2.5 rounded-xl bg-white/20 hover:bg-amber-500/80 text-white backdrop-blur-md transition-all duration-200 hover:scale-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
              title="Set as cover"
              aria-label="Set as cover"
            >
              <Star className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRenamePhoto(photo.id, photo.filename);
            }}
            className="p-2.5 rounded-xl bg-white/20 hover:bg-white/40 text-white backdrop-blur-md transition-all duration-200 hover:scale-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
            title="Rename photo"
            aria-label="Rename photo"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={handleDownload}
            className="p-2.5 rounded-xl bg-white/20 hover:bg-green-500/80 text-white backdrop-blur-md transition-all duration-200 hover:scale-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-green-500"
            title="Download photo"
            aria-label="Download photo"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeletePhoto(photo.id);
            }}
            className="p-2.5 rounded-xl bg-white/20 hover:bg-red-500/80 text-white backdrop-blur-md transition-all duration-200 hover:scale-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-red-500"
            title="Delete photo"
            aria-label="Delete photo"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* Photo - takes full image area */}
        <button
          onClick={(e) => {
            if (isSelectionMode) {
              onToggleSelection(photo.id, e.shiftKey);
              return;
            }
            onOpenPhoto(index);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (isSelectionMode) {
              return;
            }
            onRenamePhoto(photo.id, photo.filename);
          }}
          className="w-full h-full p-0 border-0 bg-transparent cursor-pointer absolute inset-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          aria-label={accessiblePhotoName}
          title={
            isSelectionMode
              ? 'Click to toggle selection. Use Shift+Click to select range.'
              : 'Click to view, double-click to rename'
          }
        >
          {imageState === 'error' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-linear-to-br from-surface-1 via-surface to-surface-1/80 p-6 text-center dark:from-surface-dark-2 dark:via-surface-dark-1 dark:to-surface-dark-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/50 bg-surface/80 text-muted shadow-inner dark:border-border/40 dark:bg-surface-dark-2/80">
                <ImageOff className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-text">Preview unavailable</p>
                <p className="text-xs font-medium text-muted">Tap to open original photo</p>
              </div>
            </div>
          ) : (
            <img
              ref={imageRef}
              src={photo.thumbnail_url}
              alt={accessiblePhotoName}
              crossOrigin="anonymous"
              className={`h-full w-full object-contain transition-opacity duration-300 ${
                imageState === 'loaded' ? 'opacity-100' : 'opacity-0'
              }`}
              loading="lazy"
              onLoad={() => setImageState('loaded')}
              onError={() => setImageState('error')}
            />
          )}
          {imageState === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-linear-to-br from-surface-1/95 via-surface/95 to-surface-1/95 px-5 dark:from-surface-dark-2/95 dark:via-surface-dark-1/95 dark:to-surface-dark-2/95">
              <div className="h-28 w-full max-w-48 animate-pulse rounded-2xl bg-surface-foreground/15 dark:bg-surface/25" />
              <div className="h-2.5 w-24 animate-pulse rounded-full bg-surface-foreground/20 dark:bg-surface/30" />
            </div>
          )}
        </button>
      </div>

      {/* Caption below the image */}
      <div className="px-4 py-3 border-t border-border/50 dark:border-border/40 bg-surface dark:bg-surface-dark-1 z-10">
        <p className="text-sm font-medium text-text truncate text-center" title={photo.filename}>
          {photo.filename}
        </p>
      </div>
    </div>
  );
};

export const PhotoCard = memo(PhotoCardComponent);
