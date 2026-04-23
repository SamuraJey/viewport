import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpDown,
  CheckSquare,
  ChevronDown,
  Download,
  Loader2,
  MoreHorizontal,
  Search,
  Share2,
  Settings,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import { formatDateOnly, formatFileSize } from '../../lib/utils';
import type { GalleryDetail, GalleryPhotoSortBy, SortOrder } from '../../types';
import { AppListbox, AppPopover } from '../ui';

interface SortOption {
  value: `${GalleryPhotoSortBy}:${SortOrder}`;
  label: string;
}

const OPEN_PUBLIC_SORT_EVENT = 'gallery:open-public-sort';
const DEFAULT_PRIVATE_SORT_STATE = { sortBy: 'uploaded_at', sortOrder: 'desc' } as const;
const DEFAULT_PUBLIC_SORT_STATE = { sortBy: 'original_filename', sortOrder: 'asc' } as const;
const toSortValue = ({ sortBy, sortOrder }: { sortBy: GalleryPhotoSortBy; sortOrder: SortOrder }) =>
  `${sortBy}:${sortOrder}` as SortOption['value'];
const DEFAULT_PRIVATE_SORT = toSortValue(DEFAULT_PRIVATE_SORT_STATE);
const DEFAULT_PUBLIC_SORT = toSortValue(DEFAULT_PUBLIC_SORT_STATE);

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
  title?: string;
  subtitle?: ReactNode;
  backTo?: string;
  backLabel?: string;
  projectNavigation?: ReactNode;
  settingsHref?: string;
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
  onAddPhotos?: () => void;
  onDownloadGallery?: () => void;
  onToggleSelectionMode?: () => void;
  isSelectionMode?: boolean;
  isDownloadingZip?: boolean;
  onCreateShareLink?: () => void;
  isCreatingShareLink?: boolean;
  shareLinkCount?: number;
  onSearchChange: (value: string) => void;
  onSortChange: (value: { sortBy: GalleryPhotoSortBy; sortOrder: SortOrder }) => void;
}

const compactButtonClass =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:focus-visible:ring-offset-surface-dark';

export const GalleryHeader = ({
  gallery,
  title,
  subtitle,
  backTo = '/dashboard',
  backLabel = 'Back to Galleries',
  projectNavigation,
  settingsHref,
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
  onAddPhotos,
  onDownloadGallery,
  onToggleSelectionMode,
  isSelectionMode = false,
  isDownloadingZip = false,
  onCreateShareLink,
  isCreatingShareLink = false,
  shareLinkCount = 0,
  onSearchChange,
  onSortChange,
}: GalleryHeaderProps) => {
  const filtersButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const activeSortValue = `${sortBy}:${sortOrder}` as SortOption['value'];
  const activePublicSortValue = `${publicSortBy}:${publicSortOrder}` as SortOption['value'];
  const activeSortLabel =
    SORT_OPTIONS.find((option) => option.value === activeSortValue)?.label ||
    SORT_OPTIONS.find((option) => option.value === DEFAULT_PRIVATE_SORT)!.label;
  const hasCustomPublicSort = activePublicSortValue !== DEFAULT_PUBLIC_SORT;
  const isDefaultPrivateSort = activeSortValue === DEFAULT_PRIVATE_SORT;

  const resolvedTitle = title || gallery.name || `Gallery #${gallery.id}`;
  const shownPhotoCount = isLoadingPhotos
    ? visiblePhotoCount
    : totalPhotoCount || visiblePhotoCount;
  const metaLine = `${shownPhotoCount} photo${shownPhotoCount === 1 ? '' : 's'} • ${formatFileSize(
    gallery.total_size_bytes ?? 0,
  )} • Created ${formatDateOnly(gallery.created_at)}`;

  useEffect(() => {
    const handleOpenPublicSort = () => {
      if (filtersButtonRef.current?.getAttribute('aria-expanded') === 'true') {
        return;
      }
      filtersButtonRef.current?.click();
    };

    window.addEventListener(OPEN_PUBLIC_SORT_EVENT, handleOpenPublicSort as EventListener);

    return () => {
      window.removeEventListener(OPEN_PUBLIC_SORT_EVENT, handleOpenPublicSort as EventListener);
    };
  }, []);

  return (
    <div className="relative z-20 -mx-1 sm:-mx-2" data-gallery-header>
      <section className="sticky top-[4.25rem] z-20 rounded-2xl border border-border/45 bg-surface/96 px-4 py-3 shadow-xs backdrop-blur-md dark:border-border/35 dark:bg-surface-dark/94 sm:top-[4.75rem] sm:px-5">
        <div className="flex min-h-14 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                to={backTo}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 text-sm font-semibold text-muted transition-colors hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{backLabel}</span>
                <span className="sm:hidden">Back</span>
              </Link>
              <h1 className="min-w-0 truncate font-oswald text-3xl font-bold uppercase leading-none tracking-wide text-text sm:text-4xl">
                {resolvedTitle}
              </h1>
            </div>

            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pl-1 text-sm font-medium text-muted">
              <span>{metaLine}</span>
              <label
                htmlFor="gallery-shooting-date"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/35 bg-surface-1/65 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted transition-colors focus-within:border-accent/50 dark:border-border/30 dark:bg-surface-dark-1/70"
              >
                <span>Shooting</span>
                <input
                  id="gallery-shooting-date"
                  type="date"
                  value={shootingDateInput}
                  onChange={(event) => onShootingDateChange(event.target.value)}
                  className="gallery-date-input h-5 min-w-0 border-none bg-transparent px-0 text-xs font-bold normal-case tracking-normal text-text focus:outline-hidden"
                  aria-label="Shooting date"
                />
                {isSavingShootingDate && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </label>
              {subtitle ? <div className="min-w-0 truncate">{subtitle}</div> : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            {onCreateShareLink ? (
              <button
                type="button"
                onClick={onCreateShareLink}
                disabled={isCreatingShareLink}
                className={`${compactButtonClass} border-border/55 bg-surface-1 text-text hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:transform-none dark:border-border/45 dark:bg-surface-dark-1`}
                aria-label="Share gallery"
              >
                {isCreatingShareLink ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Share2 className="h-4 w-4" />
                )}
                <span>Share</span>
                <span className="rounded-full bg-surface-foreground/10 px-2 py-0.5 text-[11px] font-bold text-muted dark:bg-surface/15">
                  {shareLinkCount}
                </span>
              </button>
            ) : null}

            {onAddPhotos ? (
              <button
                type="button"
                onClick={onAddPhotos}
                className={`${compactButtonClass} border-transparent bg-accent text-accent-foreground hover:brightness-110`}
                aria-label="Add photos"
              >
                <Upload className="h-4 w-4" />
                <span>Add photos</span>
              </button>
            ) : null}

            <div className="relative">
              <button
                type="button"
                aria-label="More gallery actions"
                aria-expanded={isMoreOpen}
                aria-controls="gallery-more-actions"
                onClick={() => setIsMoreOpen((open) => !open)}
                className={`${compactButtonClass} border-border/55 bg-surface-1 px-3 text-text hover:border-accent/40 hover:text-accent dark:border-border/45 dark:bg-surface-dark-1 ${
                  isMoreOpen ? 'border-accent/45 text-accent' : ''
                }`}
              >
                <MoreHorizontal className="h-5 w-5" />
                <span className="sr-only">More</span>
              </button>

              {isMoreOpen ? (
                <div
                  id="gallery-more-actions"
                  className="absolute right-0 top-full z-20 mt-2 w-64 rounded-2xl border border-border/50 bg-surface p-2 shadow-lg dark:border-border/40 dark:bg-surface-dark-1"
                >
                  <div className="space-y-1">
                    {onDownloadGallery ? (
                      <button
                        type="button"
                        onClick={onDownloadGallery}
                        disabled={isDownloadingZip}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-text transition-colors hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isDownloadingZip ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        Download ZIP
                      </button>
                    ) : null}
                    {onToggleSelectionMode ? (
                      <button
                        type="button"
                        onClick={onToggleSelectionMode}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-text transition-colors hover:bg-accent/10 hover:text-accent"
                      >
                        <CheckSquare className="h-4 w-4" />
                        {isSelectionMode ? 'Cancel selection' : 'Select photos'}
                      </button>
                    ) : null}
                    {settingsHref ? (
                      <Link
                        to={settingsHref}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-text transition-colors hover:bg-accent/10 hover:text-accent"
                      >
                        <Settings className="h-4 w-4" />
                        Project settings
                      </Link>
                    ) : null}
                    {projectNavigation ? (
                      <div className="border-y border-border/35 py-2 dark:border-border/25">
                        <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                          Galleries
                        </p>
                        {projectNavigation}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={onDeleteGallery}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-danger transition-colors hover:bg-danger/10"
                      aria-label="Delete gallery"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete gallery
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section
        className="sticky top-[8.85rem] z-10 mt-3 rounded-2xl border border-border/40 bg-surface/95 p-3 shadow-xs backdrop-blur-md dark:border-border/30 dark:bg-surface-dark/92 sm:top-[9.3rem]"
        aria-label="Gallery photo controls"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label
            htmlFor="gallery-photo-search"
            className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border/35 bg-surface-1 px-3 text-sm text-text transition-all duration-200 focus-within:border-accent/60 focus-within:shadow-xs dark:border-border/25 dark:bg-surface-dark-1 lg:max-w-184"
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
            <AppListbox
              value={activeSortValue}
              onChange={(value) => onSortChange(parseSortValue(value, DEFAULT_PRIVATE_SORT_STATE))}
              options={SORT_OPTIONS}
              className="min-w-0 flex-1 lg:w-64 lg:flex-none"
              aria-label="Sort photos"
              startContent={<ArrowUpDown className="h-4 w-4 text-muted" />}
              buttonClassName={(open) =>
                `h-11 border px-3 text-sm font-semibold transition-all duration-200 dark:bg-surface-dark-1 ${
                  open || !isDefaultPrivateSort
                    ? 'border-accent/45 bg-accent/5 text-accent dark:border-accent/55'
                    : 'border-border/40 bg-surface-1 text-text hover:border-accent/40 dark:border-border/30'
                }`
              }
              optionsClassName="bg-surface p-1 dark:bg-surface-dark-1"
            />

            <AppPopover
              className="relative shrink-0"
              buttonRef={filtersButtonRef}
              buttonAriaLabel="Filters and public sort"
              buttonClassName={(open) =>
                `inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:translate-y-0 dark:focus-visible:ring-offset-surface-dark ${
                  open || hasCustomPublicSort
                    ? 'border-accent/45 bg-accent/10 text-accent'
                    : 'border-border/40 bg-surface-1 text-text hover:border-accent/40 hover:text-accent dark:border-border/30 dark:bg-surface-dark-1'
                }`
              }
              buttonContent={(open) => (
                <>
                  <SlidersHorizontal className="h-4 w-4" />
                  <span>Filters</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                  />
                </>
              )}
              panelClassName="w-80 rounded-2xl border border-border/50 bg-surface p-4 shadow-lg dark:border-border/40 dark:bg-surface-dark-1"
              panel={
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="gallery-public-sort"
                      className="text-xs font-bold uppercase tracking-wider text-muted"
                    >
                      Public gallery sort
                    </label>
                    <AppListbox
                      value={activePublicSortValue}
                      onChange={(value) =>
                        onPublicSortChange(parseSortValue(value, DEFAULT_PUBLIC_SORT_STATE))
                      }
                      options={SORT_OPTIONS.map((option) => ({ ...option, value: option.value }))}
                      aria-label="Public gallery sort"
                      startContent={<ArrowUpDown className="h-4 w-4 text-muted" />}
                      buttonClassName="h-10 border border-border/40 bg-surface-1 px-2.5 text-sm font-semibold text-text dark:border-border/30 dark:bg-surface-dark-2"
                    />
                    {isSavingPublicSortSettings && (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Saving public sorting...
                      </p>
                    )}
                  </div>

                  <p className="text-xs text-muted">Changes are applied automatically.</p>
                </div>
              }
            />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/30 pt-2 text-xs font-semibold text-muted dark:border-border/25">
          <p>
            Showing {visiblePhotoCount} of {totalPhotoCount} photos <span aria-hidden>•</span>{' '}
            {activeSortLabel}
          </p>
          {isLoadingPhotos ? (
            <span className="inline-flex items-center gap-1.5 text-accent" aria-live="polite">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
};
