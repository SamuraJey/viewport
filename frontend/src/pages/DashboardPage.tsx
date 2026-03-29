import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ErrorDisplay } from '../components/ErrorDisplay';
import { CreateGalleryModal } from '../components/dashboard/CreateGalleryModal';
import { EnhancedGalleryCard } from '../components/dashboard/EnhancedGalleryCard';
import { useDashboardActions } from '../hooks';
import type { Gallery } from '../types';
import type { SortOrder } from '../types/gallery';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.03 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 320, damping: 26 },
  },
  exit: { opacity: 0, scale: 0.95, y: -6, transition: { duration: 0.14 } },
};

type DashboardSortBy = 'created_at' | 'shooting_date' | 'name' | 'photo_count' | 'total_size_bytes';
const DEFAULT_SORT_BY: DashboardSortBy = 'created_at';
const DEFAULT_SORT_ORDER: SortOrder = 'desc';
const SEARCH_DEBOUNCE_MS = 300;

const isDashboardSortBy = (value: string | null): value is DashboardSortBy =>
  value === 'created_at' ||
  value === 'shooting_date' ||
  value === 'name' ||
  value === 'photo_count' ||
  value === 'total_size_bytes';

const isSortOrder = (value: string | null): value is SortOrder =>
  value === 'asc' || value === 'desc';

const compareValues = (
  left: Gallery,
  right: Gallery,
  sortBy: DashboardSortBy,
  sortOrder: SortOrder,
): number => {
  const direction = sortOrder === 'asc' ? 1 : -1;

  if (sortBy === 'name') {
    const delta = (left.name || '').localeCompare(right.name || '', undefined, {
      sensitivity: 'base',
      numeric: true,
    });
    if (delta !== 0) return delta * direction;
    return left.id.localeCompare(right.id);
  }

  if (sortBy === 'photo_count') {
    const delta = (left.photo_count ?? 0) - (right.photo_count ?? 0);
    if (delta !== 0) return delta * direction;
    return left.id.localeCompare(right.id);
  }

  if (sortBy === 'total_size_bytes') {
    const delta = (left.total_size_bytes ?? 0) - (right.total_size_bytes ?? 0);
    if (delta !== 0) return delta * direction;
    return left.id.localeCompare(right.id);
  }

  const leftDate = Date.parse(sortBy === 'shooting_date' ? left.shooting_date : left.created_at);
  const rightDate = Date.parse(sortBy === 'shooting_date' ? right.shooting_date : right.created_at);
  const delta = leftDate - rightDate;
  if (delta !== 0) return delta * direction;
  return left.id.localeCompare(right.id);
};

export const DashboardPage = () => {
  const navigate = useNavigate();
  const {
    galleries,
    isCreating,
    isRenaming,
    pagination,
    createModal,
    error,
    clearError,
    isLoading,
    ConfirmModal,
    fetchGalleries,
    createGallery,
    deleteGallery,
    renameGallery,
  } = useDashboardActions();
  const {
    page,
    pageSize,
    totalPages,
    isFirstPage,
    isLastPage,
    previousPage,
    nextPage,
    firstPage,
    setTotal,
    goToPage,
  } = pagination;

  const [searchParams, setSearchParams] = useSearchParams();

  const urlSearch = searchParams.get('search') ?? '';
  const sortByParam = searchParams.get('sort_by');
  const orderParam = searchParams.get('order');
  const sortBy: DashboardSortBy = isDashboardSortBy(sortByParam) ? sortByParam : DEFAULT_SORT_BY;
  const sortOrder: SortOrder = isSortOrder(orderParam) ? orderParam : DEFAULT_SORT_ORDER;

  const [searchInput, setSearchInput] = useState(urlSearch);
  const [newGalleryName, setNewGalleryName] = useState('');
  const [newGalleryShootingDate, setNewGalleryShootingDate] = useState('');
  const [renameGalleryId, setRenameGalleryId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [showLoadingSkeleton, setShowLoadingSkeleton] = useState(false);

  const newGalleryInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchGalleries();
  }, [fetchGalleries]);

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const normalized = searchInput.trim();
      const active = urlSearch.trim();
      if (normalized === active) return;

      const nextParams = new URLSearchParams(searchParams);
      if (normalized) {
        nextParams.set('search', normalized);
      } else {
        nextParams.delete('search');
      }
      nextParams.delete('page');
      setSearchParams(nextParams);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput, searchParams, setSearchParams, urlSearch]);

  useEffect(() => {
    if (!isLoading) {
      setShowLoadingSkeleton(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowLoadingSkeleton(true);
    }, 220);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isLoading]);

  useEffect(() => {
    if (createModal.isOpen) {
      newGalleryInputRef.current?.focus();
    }
  }, [createModal.isOpen]);

  useEffect(() => {
    if (renameGalleryId) {
      renameInputRef.current?.focus();
    }
  }, [renameGalleryId]);

  const filteredAndSortedGalleries = useMemo(() => {
    const normalizedSearch = urlSearch.trim().toLowerCase();
    const filtered = normalizedSearch
      ? galleries.filter((gallery) => gallery.name.toLowerCase().includes(normalizedSearch))
      : galleries;
    return [...filtered].sort((left, right) => compareValues(left, right, sortBy, sortOrder));
  }, [galleries, sortBy, sortOrder, urlSearch]);

  useEffect(() => {
    setTotal(filteredAndSortedGalleries.length);
  }, [filteredAndSortedGalleries.length, setTotal]);

  const paginatedGalleries = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAndSortedGalleries.slice(start, start + pageSize);
  }, [filteredAndSortedGalleries, page, pageSize]);

  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      goToPage(totalPages);
    }
  }, [page, totalPages, goToPage]);

  const handleOpenModal = () => {
    setNewGalleryName('');
    setNewGalleryShootingDate(new Date().toISOString().slice(0, 10));
    clearError();
    createModal.open();
  };

  const handleConfirmCreate = () => {
    void createGallery(newGalleryName, newGalleryShootingDate);
  };

  const beginInlineRename = (gallery: Gallery) => {
    clearError();
    setRenameGalleryId(gallery.id);
    setRenameInput(gallery.name);
  };

  const cancelInlineRename = () => {
    setRenameGalleryId(null);
    setRenameInput('');
  };

  const handleConfirmRename = async () => {
    if (!renameGalleryId) return;
    await renameGallery(renameGalleryId, renameInput);
    setRenameGalleryId(null);
  };

  const handleShareGallery = (gallery: Gallery) => {
    navigate(`/galleries/${gallery.id}#share-links`);
  };

  const handleSortByChange = (value: DashboardSortBy) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value === DEFAULT_SORT_BY) {
      nextParams.delete('sort_by');
    } else {
      nextParams.set('sort_by', value);
    }
    nextParams.delete('page');
    setSearchParams(nextParams);
    firstPage();
  };

  const handleSortOrderChange = (value: SortOrder) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value === DEFAULT_SORT_ORDER) {
      nextParams.delete('order');
    } else {
      nextParams.set('order', value);
    }
    nextParams.delete('page');
    setSearchParams(nextParams);
    firstPage();
  };

  const renderLoading = () => (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-border bg-surface dark:bg-surface-foreground/95 animate-pulse"
        >
          <div className="h-48 bg-muted/20 dark:bg-muted-dark/20" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-3/4 rounded bg-muted/20 dark:bg-muted-dark/20" />
            <div className="h-3 w-1/2 rounded bg-muted/20 dark:bg-muted-dark/20" />
          </div>
        </div>
      ))}
    </div>
  );

  const renderError = () => (
    <ErrorDisplay error={error!} onRetry={fetchGalleries} onDismiss={clearError} variant="banner" />
  );

  const renderEmptyState = () => (
    <div className="rounded-3xl border border-dashed border-border bg-surface-1/50 px-4 py-24 text-center dark:bg-surface-dark-1/50 dark:border-border/40">
      <div className="mb-6 inline-flex rounded-full bg-accent/10 p-4">
        <Plus className="h-8 w-8 text-accent" />
      </div>
      <h3 className="mb-2 text-2xl font-semibold text-text">No galleries yet</h3>
      <p className="mx-auto mb-8 max-w-md text-lg text-muted">
        Create your first gallery to start organizing and sharing your photos.
      </p>
      <button
        onClick={handleOpenModal}
        disabled={isCreating}
        className="inline-flex items-center gap-2 rounded-xl bg-accent px-8 py-3 font-semibold text-accent-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        aria-label="Create your first gallery"
      >
        {isCreating ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-foreground/20 border-t-accent-foreground" />
        ) : (
          <Plus className="h-5 w-5" />
        )}
        Create First Gallery
      </button>
    </div>
  );

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    return (
      <div className="mt-8 flex items-center justify-between text-sm text-muted dark:text-muted-dark">
        <p>
          Page <span className="font-bold text-text">{page}</span> of{' '}
          <span className="font-bold text-text">{totalPages}</span>
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={previousPage}
            disabled={isFirstPage || isLoading}
            className="rounded-lg border-2 border-border p-2 text-muted shadow-sm transition-all duration-200 hover:scale-110 hover:border-accent hover:text-accent active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 dark:border-border/40 dark:text-muted-dark"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={nextPage}
            disabled={isLastPage || isLoading}
            className="rounded-lg border-2 border-border p-2 text-muted shadow-sm transition-all duration-200 hover:scale-110 hover:border-accent hover:text-accent active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 dark:border-border/40 dark:text-muted-dark"
            aria-label="Next page"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  };

  const renderGalleryGrid = () => (
    <>
      <motion.div
        className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <AnimatePresence mode="popLayout">
          <motion.button
            layout
            variants={cardVariants}
            onClick={handleOpenModal}
            disabled={isCreating}
            className="flex h-full min-h-[304px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface-1/60 p-6 text-muted transition-all duration-300 hover:border-accent/60 hover:bg-accent/5 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:border-border/50 dark:bg-surface-dark-1/45"
            aria-label="Create new gallery card"
          >
            <Plus className="mb-3 h-10 w-10" />
            <span className="font-semibold">Create New Gallery</span>
          </motion.button>

          {paginatedGalleries.map((gallery) => (
            <EnhancedGalleryCard
              key={gallery.id}
              gallery={gallery}
              isRenamingThis={renameGalleryId === gallery.id}
              renameInput={renameInput}
              isRenaming={isRenaming}
              renameInputRef={renameInputRef}
              onRenameInputChange={setRenameInput}
              onConfirmRename={handleConfirmRename}
              onCancelRename={cancelInlineRename}
              onBeginRename={beginInlineRename}
              onDelete={deleteGallery}
              onShare={handleShareGallery}
              variants={cardVariants}
            />
          ))}
        </AnimatePresence>
      </motion.div>
      {renderPagination()}
    </>
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-oswald text-4xl font-bold uppercase tracking-wider text-text">
            My Galleries
          </h1>
          <p className="font-cuprum text-lg text-muted">
            Your personal space to organize and share moments.
          </p>
        </div>
        <button
          onClick={handleOpenModal}
          disabled={isCreating}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 font-semibold text-accent-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          aria-label="Create new gallery"
        >
          {isCreating ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-foreground/20 border-t-accent-foreground" />
          ) : (
            <Plus className="h-5 w-5" />
          )}
          New Gallery
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto]">
        <label
          htmlFor="dashboard-gallery-search"
          className="relative flex items-center rounded-xl border border-border bg-surface px-3 py-2 dark:bg-surface-dark"
        >
          <Search className="mr-2 h-4 w-4 text-muted" />
          <input
            id="dashboard-gallery-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search galleries..."
            className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
            aria-label="Search galleries"
          />
        </label>

        <label className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm dark:bg-surface-dark">
          <span className="text-muted">Sort:</span>
          <select
            value={sortBy}
            onChange={(event) => handleSortByChange(event.target.value as DashboardSortBy)}
            className="bg-transparent text-text outline-none"
            aria-label="Sort galleries by"
          >
            <option value="created_at">Date created</option>
            <option value="shooting_date">Shooting date</option>
            <option value="name">Name</option>
            <option value="photo_count">Photo count</option>
            <option value="total_size_bytes">Size</option>
          </select>
        </label>

        <label className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm dark:bg-surface-dark">
          <span className="text-muted">Order:</span>
          <select
            value={sortOrder}
            onChange={(event) => handleSortOrderChange(event.target.value as SortOrder)}
            className="bg-transparent text-text outline-none"
            aria-label="Sort order"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
      </div>

      {error && renderError()}

      {isLoading && showLoadingSkeleton
        ? renderLoading()
        : isLoading
          ? null
          : galleries.length === 0
            ? renderEmptyState()
            : renderGalleryGrid()}

      <AnimatePresence>
        <CreateGalleryModal
          isOpen={createModal.isOpen}
          isCreating={isCreating}
          newGalleryName={newGalleryName}
          shootingDate={newGalleryShootingDate}
          inputRef={newGalleryInputRef}
          onClose={createModal.close}
          onConfirm={handleConfirmCreate}
          onNameChange={setNewGalleryName}
          onShootingDateChange={setNewGalleryShootingDate}
        />
      </AnimatePresence>

      {ConfirmModal}
    </div>
  );
};
