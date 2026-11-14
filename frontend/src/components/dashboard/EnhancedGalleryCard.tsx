import { Link } from 'react-router';
import { Edit3, ImageIcon, Share2, Trash2 } from 'lucide-react';
import type { ReactNode, RefObject, SyntheticEvent } from 'react';
import { useEffect, useId } from 'react';

import {
  CollectionCard,
  CollectionCardCover,
  CollectionCardMetrics,
  CollectionCardTitle,
  CollectionShareBadge,
} from './CollectionCard';
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
  const descriptionId = useId();
  const galleryTitle = makeGalleryTitle(gallery);
  const coverUrl = gallery.cover_photo_thumbnail_url ?? null;
  const metadataParts = [
    `${gallery.photo_count} ${gallery.photo_count === 1 ? 'photo' : 'photos'}`,
    gallery.total_size_bytes > 0 ? formatFileSize(gallery.total_size_bytes) : null,
    formatDateOnly(gallery.shooting_date || gallery.created_at),
  ].filter(Boolean);
  const titleTextSizeClass = getCollectionTitleTextSizeClass(galleryTitle);
  const articleLabel = `${galleryTitle}. ${metadataParts.join(', ')}.`;

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
    if (!isRenamingThis || window.matchMedia?.('(pointer: coarse)').matches) return;
    renameInputRef.current?.focus({ preventScroll: true });
    renameInputRef.current?.select();
  }, [isRenamingThis, renameInputRef]);

  return (
    <CollectionCard
      ariaLabel={articleLabel}
      isEditing={isRenamingThis}
      variants={variants}
      cover={
        <CollectionCardCover
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
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onShare(gallery);
                    }}
                    className="flex h-11 w-11 items-center justify-center rounded-lg bg-black/60 can-hover:h-8 can-hover:w-8 text-white backdrop-blur-sm transition-all duration-200 hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent"
                    title="Share Gallery"
                    aria-label={`Share ${galleryTitle}`}
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onDelete(gallery);
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-lg bg-black/60 can-hover:h-8 can-hover:w-8 text-white backdrop-blur-sm transition-all duration-200 hover:bg-danger hover:text-white focus:outline-none focus-visible:ring-[3px] focus-visible:ring-danger"
                  title="Delete Gallery"
                  aria-label={`Delete ${galleryTitle}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            ) : null
          }
        >
          {coverUrl ? (
            <>
              <img
                src={coverUrl}
                alt={`${galleryTitle} cover`}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover/card:scale-[1.035]"
              />
              <div className="absolute inset-0 bg-linear-to-b from-black/5 via-black/10 to-black/40 transition-colors duration-300 group-hover/card:from-black/0 group-hover/card:via-black/15 group-hover/card:to-black/50" />
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-linear-to-br from-accent/10 via-surface-2 to-surface dark:from-accent/15 dark:via-surface-dark-2 dark:to-surface-dark">
              <div className="absolute inset-0 opacity-45 [background-image:radial-gradient(circle_at_18%_24%,rgba(31,144,255,0.16),transparent_24%),radial-gradient(circle_at_82%_72%,rgba(34,197,94,0.12),transparent_26%)]" />
              <div className="relative text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border/45 bg-surface/70 text-accent shadow-xs backdrop-blur dark:border-white/10 dark:bg-surface-dark/70">
                  <ImageIcon className="h-6 w-6" />
                </span>
                <span className="mt-3 block text-xs font-bold uppercase tracking-[0.18em] text-muted">
                  No cover yet
                </span>
              </div>
            </div>
          )}
        </CollectionCardCover>
      }
      body={
        <div className="relative flex flex-1 flex-col">
          <div
            className={`relative flex flex-1 flex-col ${isRenamingThis ? 'invisible' : ''}`}
            aria-hidden={isRenamingThis || undefined}
          >
            <span id={descriptionId} className="sr-only">
              {metadataParts.join(', ')}
            </span>
            <Link
              to={resolveGalleryPath(gallery)}
              aria-describedby={descriptionId}
              tabIndex={isRenamingThis ? -1 : undefined}
              className="flex flex-1 flex-col justify-center pr-12 no-underline can-hover:pr-5 transition-colors"
            >
              <CollectionCardTitle as="h3" className={titleTextSizeClass}>
                {galleryTitle}
              </CollectionCardTitle>
              <p className="mt-1.5 truncate text-sm text-muted">
                {gallery.project_name ?? 'Gallery'}
              </p>
            </Link>
            <button
              type="button"
              onClick={beginRenameFromEvent}
              disabled={isRenamingThis}
              className="absolute right-0 top-0 inline-flex h-11 w-11 items-center justify-center can-hover:top-1 can-hover:h-4 can-hover:w-4 text-muted transition-opacity duration-200 hover:text-accent focus:opacity-100 focus:outline-none can-hover:opacity-0 can-hover:group-hover/card:opacity-100 can-hover:group-focus-within/card:opacity-100"
              aria-label={`Rename ${galleryTitle}`}
              title="Rename gallery"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          </div>
          {isRenamingThis ? (
            <div className="absolute inset-0 flex min-w-0 flex-col gap-2">
              <textarea
                ref={renameInputRef}
                className="gallery-card-rename-input block h-12 min-h-12 w-full resize-none overflow-y-auto rounded-md border-0 bg-surface-1 px-2 py-1 text-base font-bold leading-5 tracking-tight text-text caret-accent outline-none placeholder:text-muted/60 dark:bg-surface-dark-1"
                value={renameInput}
                maxLength={GALLERY_NAME_MAX_LENGTH}
                onChange={(event) => onRenameInputChange(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
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
                rows={2}
              />
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                <span>Enter to save · Esc to cancel</span>
                <span
                  className={renameInput.length >= GALLERY_NAME_MAX_LENGTH ? 'text-danger' : ''}
                >
                  {renameInput.length}/{GALLERY_NAME_MAX_LENGTH}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      }
      footer={
        <CollectionCardMetrics
          items={[
            {
              label: 'Photos',
              value: new Intl.NumberFormat().format(gallery.photo_count),
            },
            {
              label: 'Storage',
              value: formatFileSize(gallery.total_size_bytes),
            },
            {
              label: 'Shot',
              value: formatDateOnly(gallery.shooting_date || gallery.created_at),
            },
          ]}
        />
      }
    />
  );
};
