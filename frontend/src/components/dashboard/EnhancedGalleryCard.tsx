import { Link } from 'react-router-dom';
import { Edit3, Share2, Trash2 } from 'lucide-react';
import type { ReactNode, RefObject, SyntheticEvent } from 'react';
import { useEffect } from 'react';

import { CollectionCard, CollectionShareBadge } from './CollectionCard';
import { getCollectionTitleTextSizeClass } from './collectionCardUtils';
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
  extraTopBadges?: ReactNode;
  extraActions?: ReactNode;
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

const resolveGalleryPath = (gallery: Gallery): string =>
  gallery.project_id
    ? `/projects/${gallery.project_id}/galleries/${gallery.id}`
    : `/galleries/${gallery.id}`;

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
  extraTopBadges,
  extraActions,
  variants,
}: EnhancedGalleryCardProps) => {
  const galleryTitle = makeGalleryTitle(gallery);
  const coverUrl =
    gallery.cover_photo_thumbnail_url ?? gallery.recent_photo_thumbnail_urls[0] ?? null;
  const metadataParts = [
    `${gallery.photo_count} ${gallery.photo_count === 1 ? 'photo' : 'photos'}`,
    gallery.total_size_bytes > 0 ? formatFileSize(gallery.total_size_bytes) : null,
    formatDateOnly(gallery.shooting_date || gallery.created_at),
  ].filter(Boolean);
  const maxEditorHeight = 180;
  const titleTextSizeClass = getCollectionTitleTextSizeClass(galleryTitle);

  const beginRenameFromEvent = (event: SyntheticEvent) => {
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
    <CollectionCard
      variants={variants}
      shellClassName="group relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-card-border bg-surface text-left shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:scale-[1.01] hover:shadow-xl dark:bg-surface-dark"
      coverClassName="relative h-52 overflow-hidden bg-surface-2 dark:bg-surface-dark-2"
      cover={
        coverUrl ? (
          <>
            <img
              src={coverUrl}
              alt={`${galleryTitle} cover`}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-linear-to-b from-black/5 via-black/10 to-black/40 transition-colors duration-300 group-hover:from-black/0 group-hover:via-black/15 group-hover:to-black/50" />
          </>
        ) : (
          <div className="absolute inset-0 bg-linear-to-br from-surface-2 to-surface dark:from-surface-dark-2 dark:to-surface-dark" />
        )
      }
      topOverlay={
        <>
          {gallery.has_active_share_links ? <CollectionShareBadge /> : null}
          {extraTopBadges}
        </>
      }
      topRightOverlay={
        !isRenamingThis ? (
          <>
            {extraActions}
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
          </>
        ) : null
      }
      bodyClassName={isRenamingThis ? 'flex flex-1 flex-col p-4' : 'flex flex-1 flex-col p-4'}
      body={
        isRenamingThis ? (
          <div className="w-full min-w-0">
            <div className="relative w-full">
              <div className="min-w-0">
                <textarea
                  ref={renameInputRef}
                  className={`block w-full resize-none overflow-y-auto rounded-xl border border-accent/25 bg-surface-1/80 px-3 py-2 pr-8 font-oswald ${titleTextSizeClass} font-bold uppercase text-text caret-accent outline-none transition-colors placeholder:text-muted/60 focus:border-accent/50 focus:bg-surface-1 focus:outline-none focus:ring-0 dark:bg-surface-dark-1/80 dark:text-accent-foreground`}
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
                  style={{ minHeight: 'calc(1.375em * 5)', maxHeight: `${maxEditorHeight}px` }}
                />
              </div>
              <Edit3 className="pointer-events-none absolute right-3 top-3 h-3.5 w-3.5 text-muted opacity-70" />
            </div>
            <div className="mt-1 flex items-center justify-end text-[11px] leading-none text-muted">
              <span className={renameInput.length >= GALLERY_NAME_MAX_LENGTH ? 'text-danger' : ''}>
                {renameInput.length}/{GALLERY_NAME_MAX_LENGTH}
              </span>
            </div>
          </div>
        ) : (
          <Link
            to={resolveGalleryPath(gallery)}
            className="flex flex-1 flex-col justify-center gap-4 no-underline transition-colors"
          >
            <div className="group/title relative w-full pr-5 text-left">
              <div className="min-w-0 flex-1">
                <h3
                  className={`wrap-anywhere whitespace-normal font-oswald ${titleTextSizeClass} font-bold uppercase text-text transition-colors`}
                >
                  {galleryTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={beginRenameFromEvent}
                className="absolute right-0 top-1 inline-flex h-4 w-4 items-center justify-center text-muted opacity-0 transition-opacity duration-200 hover:text-accent group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 focus:outline-none"
                aria-label={`Rename ${galleryTitle}`}
                title="Rename gallery"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="rounded-full border border-border/55 bg-surface-1 px-3 py-2 text-sm text-muted dark:border-border/45 dark:bg-surface-dark-1">
              {metadataParts.join(' • ')}
            </p>
          </Link>
        )
      }
    />
  );
};
