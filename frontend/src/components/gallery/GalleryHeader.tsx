import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpDown,
  ChevronDown,
  HardDrive,
  Loader2,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { formatDateOnly, formatFileSize } from '../../lib/utils';
import type { GalleryDetail, GalleryPhotoSortBy, SortOrder } from '../../types';

interface SortOption {
  value: `${GalleryPhotoSortBy}:${SortOrder}`;
  label: string;
}

const DEFAULT_PRIVATE_SORT: SortOption['value'] = 'uploaded_at:desc';
const DEFAULT_PUBLIC_SORT: SortOption['value'] = 'original_filename:asc';

const SORT_OPTIONS: SortOption[] = [
  { value: 'original_filename:asc', label: 'Filename (A to Z)' },
  { value: 'original_filename:desc', label: 'Filename (Z to A)' },
  { value: 'uploaded_at:desc', label: 'Date (new to old)' },
  { value: 'uploaded_at:asc', label: 'Date (old to new)' },
  { value: 'file_size:desc', label: 'Size (large to small)' },
  { value: 'file_size:asc', label: 'Size (small to large)' },
];

const isGalleryPhotoSortBy = (value: string): value is GalleryPhotoSortBy =>
  value === 'uploaded_at' || value === 'original_filename' || value === 'file_size';

const isSortOrder = (value: string): value is SortOrder => value === 'asc' || value === 'desc';

const parseSortValue = (
  value: string,
  fallback: { sortBy: GalleryPhotoSortBy; sortOrder: SortOrder },
) => {
  const [sortBy, sortOrder] = value.split(':');
  if (!isGalleryPhotoSortBy(sortBy) || !isSortOrder(sortOrder)) {
    return fallback;
  }

  return { sortBy, sortOrder };
};

interface GalleryHeaderProps {
  gallery: GalleryDetail;
  visiblePhotoCount: number;
  totalPhotoCount: number;
  isLoadingPhotos: boolean;
  shootingDateInput: string;
  onShootingDateChange: (date: string) => void;
  isSavingShootingDate: boolean;
  publicSortBy: GalleryPhotoSortBy;
  publicSortOrder: SortOrder;
  onPublicSortChange: (value: { sortBy: GalleryPhotoSortBy; sortOrder: SortOrder }) => void;
  isSavingPublicSortSettings: boolean;
  searchValue: string;
  sortBy: GalleryPhotoSortBy;
  sortOrder: SortOrder;
  onDeleteGallery: () => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: { sortBy: GalleryPhotoSortBy; sortOrder: SortOrder }) => void;
}

export const GalleryHeader = ({
  gallery,
  visiblePhotoCount,
  totalPhotoCount,
  isLoadingPhotos,
  shootingDateInput,
  onShootingDateChange,
  isSavingShootingDate,
  publicSortBy,
  publicSortOrder,
  onPublicSortChange,
  isSavingPublicSortSettings,
  searchValue,
  sortBy,
  sortOrder,
  onDeleteGallery,
  onSearchChange,
  onSortChange,
}: GalleryHeaderProps) => {
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const filtersPopoverRef = useRef<HTMLDivElement | null>(null);
  const [titleFontSizePx, setTitleFontSizePx] = useState(48);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const activeSortValue = `${sortBy}:${sortOrder}` as SortOption['value'];
  const activePublicSortValue = `${publicSortBy}:${publicSortOrder}` as SortOption['value'];
  const activeSortLabel =
    SORT_OPTIONS.find((option) => option.value === activeSortValue)?.label ||
    SORT_OPTIONS.find((option) => option.value === DEFAULT_PRIVATE_SORT)!.label;
  const hasActiveFilters = activePublicSortValue !== DEFAULT_PUBLIC_SORT;
  const isDefaultPrivateSort = activeSortValue === DEFAULT_PRIVATE_SORT;

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

  useEffect(() => {
    if (!isFiltersOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (filtersPopoverRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsFiltersOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFiltersOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFiltersOpen]);

  useEffect(() => {
    const handleOpenPublicSort = () => {
      setIsFiltersOpen(true);
    };

    window.addEventListener('gallery:open-public-sort', handleOpenPublicSort as EventListener);

    return () => {
      window.removeEventListener('gallery:open-public-sort', handleOpenPublicSort as EventListener);
    };
  }, []);

  return (
    <div className="rounded-3xl border border-border/50 bg-surface/95 p-6 shadow-xs backdrop-blur-xs dark:border-border/30 dark:bg-surface-foreground/15 sm:p-8">
      <div className="space-y-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-full space-y-5">
            <Link
              to="/dashboard"
              className="inline-flex h-10 w-fit items-center gap-2.5 rounded-xl border border-border/60 bg-surface-1 px-4 text-sm font-semibold text-muted transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-accent/5 hover:text-accent hover:shadow-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:border-border/40 dark:bg-surface-dark-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Galleries
            </Link>
            <h1
              ref={titleRef}
              style={{ fontSize: `${titleFontSizePx}px` }}
              className="max-w-full whitespace-normal wrap-break-word font-oswald font-bold uppercase leading-tight tracking-wide text-text drop-shadow-xs"
            >
              {gallery.name || `Gallery #${gallery.id}`}
            </h1>
          </div>

          <button
            onClick={onDeleteGallery}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-4 text-sm font-bold text-danger transition-all duration-200 hover:-translate-y-0.5 hover:border-danger/40 hover:bg-danger/15 hover:shadow-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:translate-y-0"
            title="Delete Gallery"
            aria-label="Delete gallery"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
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
          <label
            htmlFor="gallery-shooting-date"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/40 bg-surface px-2.5 text-xs font-medium text-muted transition-colors focus-within:border-accent/50 dark:border-border/30 dark:bg-surface-dark-1"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Shooting
            </span>
            <input
              id="gallery-shooting-date"
              type="date"
              value={shootingDateInput}
              onChange={(event) => onShootingDateChange(event.target.value)}
              className="gallery-date-input h-7 min-w-0 rounded-md border-none bg-transparent px-1 text-xs font-semibold text-text focus:outline-hidden"
              aria-label="Shooting date"
            />
            {isSavingShootingDate && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
          </label>
        </div>

        <div className="rounded-2xl border border-border/35 bg-surface-1/35 p-3 shadow-inner backdrop-blur-xs dark:border-border/25 dark:bg-surface-dark-1/35 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label
              htmlFor="gallery-photo-search"
              className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border/35 bg-surface px-3 text-sm text-text transition-all duration-200 focus-within:border-accent/60 focus-within:shadow-xs dark:border-border/25 dark:bg-surface-dark-2 lg:max-w-184"
            >
              <Search className="h-4 w-4 text-muted" />
              <input
                id="gallery-photo-search"
                type="search"
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search by filename"
                className="h-full w-full bg-transparent text-sm font-medium text-text placeholder:text-muted focus:outline-hidden"
              />
            </label>

            <div className="flex items-center gap-3 lg:ml-auto">
              <label
                className={`relative flex h-11 w-full items-center rounded-xl border bg-surface px-3 text-sm text-text transition-all duration-200 dark:bg-surface-dark-2 lg:w-64 ${
                  isDefaultPrivateSort
                    ? 'border-border/40 hover:border-accent/40 dark:border-border/30'
                    : 'border-accent/45 bg-accent/5 text-accent dark:border-accent/55'
                }`}
              >
                <ArrowUpDown className="h-4 w-4 text-muted" />
                <select
                  value={activeSortValue}
                  onChange={(event) =>
                    onSortChange(
                      parseSortValue(event.target.value, {
                        sortBy: 'uploaded_at',
                        sortOrder: 'desc',
                      }),
                    )
                  }
                  className="h-full w-full cursor-pointer appearance-none bg-transparent pl-2 pr-7 text-sm font-semibold text-text scheme-light focus:outline-hidden dark:scheme-dark"
                  aria-label="Sort photos"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      className="bg-surface text-text dark:bg-surface-dark"
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div ref={filtersPopoverRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsFiltersOpen((prev) => !prev)}
                  className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:translate-y-0 ${
                    isFiltersOpen || hasActiveFilters
                      ? 'border-accent/45 bg-accent/10 text-accent'
                      : 'border-border/40 bg-surface text-text hover:border-accent/40 hover:text-accent dark:border-border/30 dark:bg-surface-dark-2'
                  }`}
                  aria-expanded={isFiltersOpen}
                  aria-controls="gallery-public-sort-popover"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Public sort
                  <ChevronDown className="h-4 w-4" />
                </button>

                {isFiltersOpen && (
                  <div
                    id="gallery-public-sort-popover"
                    className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-80 rounded-2xl border border-border/50 bg-surface p-4 shadow-lg dark:border-border/40 dark:bg-surface-dark-1"
                  >
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label
                          htmlFor="gallery-public-sort"
                          className="text-xs font-bold uppercase tracking-wider text-muted"
                        >
                          Public gallery sort
                        </label>
                        <div className="relative flex h-10 items-center rounded-xl border border-border/40 bg-surface-1 px-2.5 dark:border-border/30 dark:bg-surface-dark-2">
                          <ArrowUpDown className="h-4 w-4 text-muted" />
                          <select
                            id="gallery-public-sort"
                            value={activePublicSortValue}
                            onChange={(event) =>
                              onPublicSortChange(
                                parseSortValue(event.target.value, {
                                  sortBy: 'original_filename',
                                  sortOrder: 'asc',
                                }),
                              )
                            }
                            className="h-full w-full cursor-pointer appearance-none bg-transparent pl-2 pr-6 text-sm font-semibold text-text scheme-light focus:outline-hidden dark:scheme-dark"
                          >
                            {SORT_OPTIONS.map((option) => (
                              <option
                                key={`public-${option.value}`}
                                value={option.value}
                                className="bg-surface text-text dark:bg-surface-dark"
                              >
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        {isSavingPublicSortSettings && (
                          <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Saving public sorting...
                          </p>
                        )}
                      </div>

                      <p className="text-xs text-muted">Changes are applied automatically.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 border-t border-border/35 pt-3 dark:border-border/25">
            <p className="text-xs font-semibold text-muted">
              Showing {visiblePhotoCount} of {totalPhotoCount} <span aria-hidden>•</span> Sorted by{' '}
              {activeSortLabel}
            </p>
          </div>

          {isLoadingPhotos && (
            <div className="mt-3 rounded-full bg-accent/15 p-0.5" aria-live="polite">
              <div className="h-1.5 w-1/2 animate-pulse rounded-full bg-accent/60" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
