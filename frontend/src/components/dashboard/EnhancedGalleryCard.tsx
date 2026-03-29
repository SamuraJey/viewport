import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Camera, Check, Edit3, HardDrive, Share2, Trash2, X } from 'lucide-react';

import { GALLERY_NAME_MAX_LENGTH } from '../../constants/gallery';
import { formatDateOnly, formatFileSize } from '../../lib/utils';
import type { Gallery } from '../../types/gallery';

interface EnhancedGalleryCardProps {
  gallery: Gallery;
  isRenamingThis: boolean;
  renameInput: string;
  isRenaming: boolean;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  onRenameInputChange: (value: string) => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  onBeginRename: (gallery: Gallery) => void;
  onDelete: (gallery: Gallery) => void;
  onShare?: (gallery: Gallery) => void;
  variants: {
    hidden: { opacity: number; y: number; scale: number };
    visible: {
      opacity: number;
      y: number;
      scale: number;
      transition: { type: 'spring'; stiffness: number; damping: number };
    };
    exit: { opacity: number; scale: number; y: number; transition: { duration: number } };
  };
}

const makeGalleryTitle = (gallery: Gallery): string =>
  gallery.name || `Gallery #${gallery.id.slice(0, 8)}`;

export const EnhancedGalleryCard = ({
  gallery,
  isRenamingThis,
  renameInput,
  isRenaming,
  renameInputRef,
  onRenameInputChange,
  onConfirmRename,
  onCancelRename,
  onBeginRename,
  onDelete,
  onShare,
  variants,
}: EnhancedGalleryCardProps) => {
  const galleryTitle = makeGalleryTitle(gallery);
  const previewThumbs = useMemo(
    () => (gallery.recent_photo_thumbnail_urls ?? []).filter(Boolean).slice(0, 3),
    [gallery.recent_photo_thumbnail_urls],
  );
  const coverUrl = gallery.cover_photo_thumbnail_url ?? previewThumbs[0] ?? null;

  return (
    <motion.div
      key={gallery.id}
      variants={variants}
      layout
      exit="exit"
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
    >
      <div className="relative h-48 overflow-hidden bg-surface-2 dark:bg-surface-dark-2">
        {coverUrl ? (
          <>
            <img
              src={coverUrl}
              alt={`${galleryTitle} cover`}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover opacity-35 blur-[2px] transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/5 to-black/40" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-surface-2 to-surface dark:from-surface-dark-2 dark:to-surface-dark" />
        )}

        <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <Camera className="h-3 w-3" />
            {gallery.photo_count}
          </span>
          {gallery.total_size_bytes > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
              <HardDrive className="h-3 w-3" />
              {formatFileSize(gallery.total_size_bytes)}
            </span>
          )}
          {gallery.has_active_share_links && (
            <span className="inline-flex items-center gap-1 rounded-md bg-accent/90 px-2 py-1 text-xs font-medium text-accent-foreground backdrop-blur-sm">
              <Share2 className="h-3 w-3" />
            </span>
          )}
        </div>

        {!isRenamingThis && (
          <div className="absolute right-3 top-3 z-10 flex gap-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus-within:opacity-100">
            {onShare ? (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onShare(gallery);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-sm transition-all duration-200 hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                title="Share Gallery"
                aria-label={`Share ${galleryTitle}`}
              >
                <Share2 className="h-4 w-4" />
              </button>
            ) : null}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onBeginRename(gallery);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-sm transition-all duration-200 hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              title="Rename Gallery"
              aria-label={`Rename ${galleryTitle}`}
            >
              <Edit3 className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(gallery);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-sm transition-all duration-200 hover:bg-danger hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-danger"
              title="Delete Gallery"
              aria-label={`Delete ${galleryTitle}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}

        {previewThumbs.length > 0 && (
          <div className="absolute bottom-3 left-3 z-10 grid w-[156px] grid-cols-3 gap-1">
            {previewThumbs.map((thumb, index) => (
              <div
                key={`${gallery.id}-thumb-${index}`}
                className="h-12 overflow-hidden rounded-md border border-white/20 bg-black/20"
              >
                <img
                  src={thumb}
                  alt={`${galleryTitle} preview ${index + 1}`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <Link
        to={`/galleries/${gallery.id}`}
        className="flex flex-1 flex-col p-4 no-underline transition-colors hover:bg-surface-1 dark:hover:bg-surface-dark-1"
        onClick={(e) => {
          if (isRenamingThis) {
            e.preventDefault();
          }
        }}
      >
        {isRenamingThis ? (
          <div className="flex items-center gap-1.5">
            <input
              ref={renameInputRef}
              className="flex-1 rounded-lg border-2 border-accent/50 bg-surface-1 px-3 py-2 text-base text-text shadow-sm transition-all duration-200 hover:border-accent/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent dark:border-accent/40 dark:bg-surface-dark-1 dark:text-accent-foreground"
              value={renameInput}
              maxLength={GALLERY_NAME_MAX_LENGTH}
              onChange={(event) => onRenameInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onConfirmRename();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  onCancelRename();
                }
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder="Gallery name..."
              aria-label="Rename gallery input"
            />
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onConfirmRename();
              }}
              disabled={isRenaming || !renameInput.trim()}
              title="Save (Enter)"
              aria-label="Confirm rename"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-green-600/50 bg-green-500/90 text-white shadow-sm transition-all duration-200 hover:scale-110 hover:bg-green-500 hover:shadow-md active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              {isRenaming ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-border/20 border-t-accent" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCancelRename();
              }}
              title="Cancel (Esc)"
              aria-label="Cancel rename"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-danger/40 bg-danger/20 text-danger transition-all duration-200 hover:scale-110 hover:bg-danger/30 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <h3
              className="line-clamp-2 min-h-6 font-oswald text-lg font-bold uppercase leading-tight tracking-wide text-text"
              title={galleryTitle}
            >
              {galleryTitle}
            </h3>
            <p className="mt-1 font-cuprum text-sm text-muted">
              {formatDateOnly(gallery.shooting_date || gallery.created_at)}
            </p>
          </>
        )}
      </Link>
    </motion.div>
  );
};
