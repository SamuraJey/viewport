import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownUp, ArrowLeft, Check, HardDrive, Loader2, Search, Trash2 } from 'lucide-react';
import { formatDateOnly, formatFileSize } from '../../lib/utils';
import type { GalleryDetail, GalleryPhotoSortBy, SortOrder } from '../../types';

interface GalleryHeaderProps {
  gallery: GalleryDetail;
  shootingDateInput: string;
  setShootingDateInput: (date: string) => void;
  isSavingShootingDate: boolean;
  publicSortBy: GalleryPhotoSortBy;
  publicSortOrder: SortOrder;
  setPublicSortBy: (value: GalleryPhotoSortBy) => void;
  setPublicSortOrder: (value: SortOrder) => void;
  isSavingPublicSortSettings: boolean;
  searchValue: string;
  sortBy: GalleryPhotoSortBy;
  sortOrder: SortOrder;
  onSaveShootingDate: () => void;
  onSavePublicSortSettings: () => void;
  onDeleteGallery: () => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: GalleryPhotoSortBy) => void;
  onSortOrderChange: (value: SortOrder) => void;
}

export const GalleryHeader = ({
  gallery,
  shootingDateInput,
  setShootingDateInput,
  isSavingShootingDate,
  publicSortBy,
  publicSortOrder,
  setPublicSortBy,
  setPublicSortOrder,
  isSavingPublicSortSettings,
  searchValue,
  sortBy,
  sortOrder,
  onSaveShootingDate,
  onSavePublicSortSettings,
  onDeleteGallery,
  onSearchChange,
  onSortByChange,
  onSortOrderChange,
}: GalleryHeaderProps) => {
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const [titleFontSizePx, setTitleFontSizePx] = useState(48);

  useLayoutEffect(() => {
    const heading = titleRef.current;
    if (!heading) {
      return;
    }

    const minSize = 16;
    const maxLines = 3;

    const recalc = () => {
      let nextSize = window.innerWidth >= 640 ? 48 : 36;
      heading.style.fontSize = `${nextSize}px`;

      while (nextSize > minSize) {
        const computed = window.getComputedStyle(heading);
        const lineHeight = parseFloat(computed.lineHeight);
        const lines = lineHeight > 0 ? Math.round(heading.scrollHeight / lineHeight) : 1;
        if (lines <= maxLines) {
          break;
        }
        nextSize -= 1;
        heading.style.fontSize = `${nextSize}px`;
      }

      setTitleFontSizePx(nextSize);
    };

    recalc();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recalc) : null;
    resizeObserver?.observe(heading);
    window.addEventListener('resize', recalc);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', recalc);
    };
  }, [gallery.name]);

  return (
    <div className="rounded-3xl border border-border/50 bg-surface p-6 dark:border-border/30 dark:bg-surface-foreground/5 sm:p-8 shadow-xs">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-5 min-w-0 max-w-full">
          <Link
            to="/dashboard"
            className="inline-flex h-10 w-fit items-center gap-2.5 rounded-xl border border-border/60 bg-surface-1 px-4 text-sm font-semibold text-muted transition-all duration-200 hover:border-accent/40 hover:text-accent hover:bg-accent/5 hover:-translate-y-0.5 hover:shadow-sm dark:border-border/40 dark:bg-surface-dark-1 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Galleries
          </Link>
          <h1
            ref={titleRef}
            style={{ fontSize: `${titleFontSizePx}px` }}
            className="max-w-full whitespace-normal wrap-break-word font-oswald font-bold leading-tight tracking-wide text-text uppercase drop-shadow-xs"
          >
            {gallery.name || `Gallery #${gallery.id}`}
          </h1>
        </div>

        <div className="w-full lg:w-auto lg:max-w-full">
          <label className="sr-only" htmlFor="gallery-shooting-date">
            Shooting date
          </label>
          <div className="flex w-full flex-col gap-3 rounded-2xl border border-border/40 bg-surface-1/60 p-3 shadow-inner dark:border-border/30 dark:bg-surface-dark-1/70 lg:w-auto lg:min-w-[22rem]">
            <div className="grid grid-cols-1 gap-2 rounded-xl border border-border/40 bg-surface px-2.5 py-2 dark:border-border/30 dark:bg-surface-dark-1 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label
                htmlFor="gallery-photo-search"
                className="flex h-10 items-center gap-2 rounded-lg border border-border/40 bg-surface-1 px-3 text-sm text-text dark:border-border/30 dark:bg-surface-dark-2"
              >
                <Search className="h-4 w-4 text-muted" />
                <input
                  id="gallery-photo-search"
                  type="search"
                  value={searchValue}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Search photos"
                  className="h-full w-full bg-transparent text-sm font-medium text-text placeholder:text-muted focus:outline-hidden"
                />
              </label>

              <label className="relative flex h-10 min-w-38 items-center rounded-lg border border-border/40 bg-surface-1 px-2.5 text-sm text-text dark:border-border/30 dark:bg-surface-dark-2">
                <ArrowDownUp className="h-3.5 w-3.5 text-muted" />
                <select
                  value={sortBy}
                  onChange={(event) => onSortByChange(event.target.value as GalleryPhotoSortBy)}
                  className="h-full w-full cursor-pointer appearance-none bg-transparent pl-2 pr-6 text-sm font-medium text-text scheme-light focus:outline-hidden dark:scheme-dark"
                  aria-label="Sort photos by"
                >
                  <option value="created_at" className="bg-surface text-text dark:bg-surface-dark">
                    Newest
                  </option>
                  <option
                    value="original_filename"
                    className="bg-surface text-text dark:bg-surface-dark"
                  >
                    Filename
                  </option>
                  <option value="file_size" className="bg-surface text-text dark:bg-surface-dark">
                    File size
                  </option>
                </select>
              </label>

              <label className="relative flex h-10 min-w-27 items-center rounded-lg border border-border/40 bg-surface-1 px-2.5 text-sm text-text dark:border-border/30 dark:bg-surface-dark-2">
                <select
                  value={sortOrder}
                  onChange={(event) => onSortOrderChange(event.target.value as SortOrder)}
                  className="h-full w-full cursor-pointer appearance-none bg-transparent pr-6 text-sm font-medium text-text scheme-light focus:outline-hidden dark:scheme-dark"
                  aria-label="Sort order"
                >
                  <option value="desc" className="bg-surface text-text dark:bg-surface-dark">
                    Desc
                  </option>
                  <option value="asc" className="bg-surface text-text dark:bg-surface-dark">
                    Asc
                  </option>
                </select>
              </label>
            </div>

            <div className="flex flex-col gap-2 rounded-xl border border-border/40 bg-surface px-2.5 py-2 dark:border-border/30 dark:bg-surface-dark-1 sm:flex-row sm:items-center focus-within:ring-2 focus-within:ring-accent/30 focus-within:border-accent/50 transition-all duration-200">
              <span className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted">
                Shooting date
              </span>
              <div className="relative flex min-w-0 flex-1 items-center">
                <input
                  id="gallery-shooting-date"
                  type="date"
                  value={shootingDateInput}
                  onChange={(e) => setShootingDateInput(e.target.value)}
                  className="gallery-date-input h-10 min-w-0 w-full rounded-lg border-none bg-transparent px-2 text-sm font-medium text-text focus:outline-hidden"
                />
              </div>
              <button
                onClick={onSaveShootingDate}
                disabled={
                  isSavingShootingDate ||
                  !shootingDateInput ||
                  shootingDateInput === gallery.shooting_date?.slice(0, 10)
                }
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-bold text-accent-foreground transition-all duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                {isSavingShootingDate ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Save
              </button>
            </div>

            <div className="flex flex-col gap-2 rounded-xl border border-border/40 bg-surface px-2.5 py-2 dark:border-border/30 dark:bg-surface-dark-1">
              <span className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted">
                Public gallery sorting
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <label className="relative flex h-10 min-w-38 items-center rounded-lg border border-border/40 bg-surface-1 px-2.5 text-sm text-text dark:border-border/30 dark:bg-surface-dark-2">
                  <ArrowDownUp className="h-3.5 w-3.5 text-muted" />
                  <select
                    value={publicSortBy}
                    onChange={(event) => setPublicSortBy(event.target.value as GalleryPhotoSortBy)}
                    className="h-full w-full cursor-pointer appearance-none bg-transparent pl-2 pr-6 text-sm font-medium text-text scheme-light focus:outline-hidden dark:scheme-dark"
                    aria-label="Sort public gallery photos by"
                  >
                    <option
                      value="created_at"
                      className="bg-surface text-text dark:bg-surface-dark"
                    >
                      Newest
                    </option>
                    <option
                      value="original_filename"
                      className="bg-surface text-text dark:bg-surface-dark"
                    >
                      Filename
                    </option>
                    <option value="file_size" className="bg-surface text-text dark:bg-surface-dark">
                      File size
                    </option>
                  </select>
                </label>

                <label className="relative flex h-10 min-w-27 items-center rounded-lg border border-border/40 bg-surface-1 px-2.5 text-sm text-text dark:border-border/30 dark:bg-surface-dark-2">
                  <select
                    value={publicSortOrder}
                    onChange={(event) => setPublicSortOrder(event.target.value as SortOrder)}
                    className="h-full w-full cursor-pointer appearance-none bg-transparent pr-6 text-sm font-medium text-text scheme-light focus:outline-hidden dark:scheme-dark"
                    aria-label="Public gallery sort order"
                  >
                    <option value="desc" className="bg-surface text-text dark:bg-surface-dark">
                      Desc
                    </option>
                    <option value="asc" className="bg-surface text-text dark:bg-surface-dark">
                      Asc
                    </option>
                  </select>
                </label>

                <button
                  onClick={onSavePublicSortSettings}
                  disabled={
                    isSavingPublicSortSettings ||
                    (publicSortBy === gallery.public_sort_by &&
                      publicSortOrder === gallery.public_sort_order)
                  }
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-bold text-accent-foreground transition-all duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  {isSavingPublicSortSettings ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Save
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 text-xs font-semibold text-accent"
                title={`Total gallery size: ${formatFileSize(gallery.total_size_bytes ?? 0)}`}
              >
                <HardDrive className="h-3.5 w-3.5" />
                {formatFileSize(gallery.total_size_bytes ?? 0)}
              </span>
              <span className="inline-flex h-9 items-center rounded-lg border border-border/40 bg-surface px-3 text-xs font-medium text-muted dark:border-border/30 dark:bg-surface-dark-1">
                Created {formatDateOnly(gallery.created_at)}
              </span>
              <button
                onClick={onDeleteGallery}
                className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-4 text-sm font-bold text-danger transition-all duration-200 hover:bg-danger/15 hover:border-danger/40 hover:-translate-y-0.5 hover:shadow-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:translate-y-0"
                title="Delete Gallery"
                aria-label="Delete gallery"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
