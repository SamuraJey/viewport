import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Camera, Edit3, HardDrive, Share2, Trash2 } from 'lucide-react';
import type { RefObject, SyntheticEvent } from 'react';
import { useEffect } from 'react';

import { GALLERY_NAME_MAX_LENGTH } from '../../constants/gallery';
import { formatDateOnly, formatFileSize } from '../../lib/utils';
import type { Gallery } from '../../types/gallery';

interface EnhancedGalleryCardProps {
  gallery: Gallery;
  isRenamingThis: boolean;
  renameInput: string;
  isRenaming: boolean;
  renameInputRef: RefObject<HTMLTextAreaElement | null>;
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
  const coverUrl =
    gallery.cover_photo_thumbnail_url ?? gallery.recent_photo_thumbnail_urls[0] ?? null;
  const maxEditorHeight = 78;
  const titleTextSizeClass =
    galleryTitle.length > 80
      ? 'text-sm leading-snug tracking-normal'
      : galleryTitle.length > 34
        ? 'text-base leading-snug tracking-tight'
        : 'text-lg leading-tight tracking-wide';

  const beginRename = (event: SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onBeginRename(gallery);
  };

  const commitRename = () => {
    if (renameInput.trim()) {
      onConfirmRename();
      return;
    }

    onCancelRename();
  };

  useEffect(() => {
    if (!isRenamingThis) return;

    const editor = renameInputRef.current;
    if (!editor) return;

    editor.style.height = '0px';
    editor.style.height = `${Math.min(editor.scrollHeight, maxEditorHeight)}px`;
  }, [isRenamingThis, renameInput, renameInputRef]);

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
            <div className="absolute inset-0 bg-linear-to-b from-black/20 via-black/5 to-black/40" />
          </>
        ) : (
          <div className="absolute inset-0 bg-linear-to-br from-surface-2 to-surface dark:from-surface-dark-2 dark:to-surface-dark" />
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
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
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
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
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
      </div>

      {isRenamingThis ? (
        <div className="flex flex-1 flex-col p-4">
          <div className="w-full min-w-0">
            <div className="relative w-full pr-5">
              <div className="min-w-0">
                <textarea
                  ref={renameInputRef}
                  className={`block w-full resize-none overflow-hidden border-0 border-b border-transparent bg-transparent px-0 py-0 font-oswald ${titleTextSizeClass} font-bold uppercase text-text caret-accent outline-none transition-colors placeholder:text-muted/60 focus:border-accent/50 focus:outline-none focus:ring-0 dark:text-accent-foreground`}
                  value={renameInput}
                  maxLength={GALLERY_NAME_MAX_LENGTH}
                  onChange={(event) => onRenameInputChange(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitRename();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      onCancelRename();
                    }
                  }}
                  onFocus={(event) => event.stopPropagation()}
                  onMouseDownCapture={(event) => event.stopPropagation()}
                  onPointerDownCapture={(event) => event.stopPropagation()}
                  onClickCapture={(event) => event.stopPropagation()}
                  onDoubleClickCapture={(event) => event.stopPropagation()}
                  aria-label="Rename gallery input"
                  aria-busy={isRenaming}
                  autoComplete="off"
                  spellCheck={false}
                  readOnly={isRenaming}
                  rows={1}
                  style={{ minHeight: 'calc(1.375em * 3)', maxHeight: `${maxEditorHeight}px` }}
                />
              </div>
              <Edit3 className="pointer-events-none absolute right-0 top-1 h-3.5 w-3.5 text-muted opacity-70" />
            </div>
            <div className="mt-1 flex items-center justify-end text-[11px] leading-none text-muted">
              <span className={renameInput.length >= GALLERY_NAME_MAX_LENGTH ? 'text-danger' : ''}>
                {renameInput.length}/{GALLERY_NAME_MAX_LENGTH}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <Link
          to={`/galleries/${gallery.id}`}
          className="flex flex-1 flex-col p-4 no-underline transition-colors hover:bg-surface-1 dark:hover:bg-surface-dark-1"
        >
          <div
            role="button"
            tabIndex={0}
            onClick={beginRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                beginRename(event);
              }
            }}
            className="group/title relative w-full pr-5 text-left transition-colors hover:text-accent focus:outline-none"
            aria-label={`Rename ${galleryTitle}`}
            title="Click to rename"
          >
            <div className="min-w-0 flex-1">
              <h3
                className={`wrap-anywhere whitespace-normal font-oswald ${titleTextSizeClass} font-bold uppercase text-text transition-colors group-hover:text-accent`}
              >
                {galleryTitle}
              </h3>
            </div>
            <Edit3 className="pointer-events-none absolute right-0 top-1 h-3.5 w-3.5 text-muted opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" />
          </div>
          <p className="mt-1 font-cuprum text-sm text-muted">
            {formatDateOnly(gallery.shooting_date || gallery.created_at)}
          </p>
        </Link>
      )}
    </motion.div>
  );
};
