import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, ChevronLeft, ChevronRight, Plus, Search, Share2, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ErrorDisplay } from '../components/ErrorDisplay';
import { CreateGalleryModal } from '../components/dashboard/CreateGalleryModal';
import { EnhancedGalleryCard } from '../components/dashboard/EnhancedGalleryCard';
import { useDashboardActions } from '../hooks';
import { parseUtcDateTimeInputValue } from '../components/share-links/shareLinkDateTime';
import { shareLinkService } from '../services/shareLinkService';
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
  const [shareModalGallery, setShareModalGallery] = useState<Gallery | null>(null);
  const [shareLabelInput, setShareLabelInput] = useState('');
  const [shareIsActiveInput, setShareIsActiveInput] = useState(true);
  const [shareExpiresAtInput, setShareExpiresAtInput] = useState('');
  const [isCreatingShareLink, setIsCreatingShareLink] = useState(false);
  const [shareModalError, setShareModalError] = useState('');

  const newGalleryInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLTextAreaElement>(null);

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
    setShareModalGallery(gallery);
    setShareLabelInput('');
    setShareIsActiveInput(true);
    setShareExpiresAtInput('');
    setShareModalError('');
  };

  const handleCloseShareModal = () => {
    if (isCreatingShareLink) {
      return;
    }
    setShareModalGallery(null);
    setShareModalError('');
  };

  const handleCreateShareLinkFromModal = async () => {
    if (!shareModalGallery) {
      return;
    }

    const normalizedLabel = shareLabelInput.trim();
    const parsedExpiresAt = parseUtcDateTimeInputValue(shareExpiresAtInput);

    if (shareExpiresAtInput && !parsedExpiresAt) {
      setShareModalError('Please enter a valid expiration date and time.');
      return;
    }

    try {
      setIsCreatingShareLink(true);
      setShareModalError('');

      const created = await shareLinkService.createShareLink(shareModalGallery.id);

      if (normalizedLabel.length > 0 || !shareIsActiveInput || parsedExpiresAt) {
        await shareLinkService.updateShareLink(shareModalGallery.id, created.id, {
          label: normalizedLabel.length > 0 ? normalizedLabel : null,
          is_active: shareIsActiveInput,
          expires_at: parsedExpiresAt,
        });
      }

      await fetchGalleries();
      setShareModalGallery(null);
      navigate(`/share-links/${created.id}`);
    } catch (err) {
      setShareModalError(err instanceof Error ? err.message : 'Failed to create share link.');
    } finally {
      setIsCreatingShareLink(false);
    }
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
            className="flex h-full min-h-76 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface-1/60 p-6 text-muted transition-all duration-300 hover:border-accent/60 hover:bg-accent/5 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:border-border/50 dark:bg-surface-dark-1/45"
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

      <AnimatePresence>
        {shareModalGallery ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseShareModal}
            />

            <motion.div
              className="relative w-full max-w-xl rounded-2xl border border-border/40 bg-surface shadow-2xl dark:bg-surface-dark"
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            >
              <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-accent/15 p-2 text-accent">
                    <Share2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-text">Create Share Link</h2>
                    <p className="text-xs text-muted">
                      For {shareModalGallery.name || 'Untitled gallery'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCloseShareModal}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-1 hover:text-text"
                  disabled={isCreatingShareLink}
                  aria-label="Close share link modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-5 px-6 py-5">
                <div className="space-y-2">
                  <label htmlFor="share-link-label" className="text-sm font-semibold text-text">
                    Label
                  </label>
                  <input
                    id="share-link-label"
                    type="text"
                    value={shareLabelInput}
                    onChange={(event) => setShareLabelInput(event.target.value)}
                    maxLength={127}
                    placeholder="Preview for client"
                    className="w-full rounded-xl border border-border/50 bg-surface-1 px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent dark:bg-surface-dark-1"
                    disabled={isCreatingShareLink}
                  />
                </div>

                <div className="rounded-xl border border-border/50 bg-surface-1 px-4 py-3 dark:bg-surface-dark-1">
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span>
                      <span className="block text-sm font-semibold text-text">Link status</span>
                      <span className="block text-xs text-muted">Inactive links return 404</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={shareIsActiveInput}
                      onChange={(event) => setShareIsActiveInput(event.target.checked)}
                      disabled={isCreatingShareLink}
                      className="h-4 w-4 accent-accent"
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="share-link-expiration"
                    className="text-sm font-semibold text-text"
                  >
                    TTL (UTC)
                  </label>
                  <p className="text-xs text-muted">Stored in UTC.</p>
                  <div className="relative">
                    <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input
                      id="share-link-expiration"
                      type="datetime-local"
                      value={shareExpiresAtInput}
                      onChange={(event) => setShareExpiresAtInput(event.target.value)}
                      className="w-full rounded-xl border border-border/50 bg-surface-1 py-2.5 pl-9 pr-3 text-sm text-text outline-none transition-colors focus:border-accent dark:bg-surface-dark-1"
                      disabled={isCreatingShareLink}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShareExpiresAtInput('')}
                    className="text-xs font-semibold text-accent hover:underline"
                    disabled={isCreatingShareLink || shareExpiresAtInput.length === 0}
                  >
                    Clear expiration
                  </button>
                </div>

                {shareModalError ? (
                  <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {shareModalError}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-border/40 px-6 py-4">
                <button
                  type="button"
                  onClick={handleCloseShareModal}
                  className="rounded-xl border border-border/50 px-4 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-1"
                  disabled={isCreatingShareLink}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateShareLinkFromModal}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-all hover:-translate-y-0.5 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isCreatingShareLink}
                >
                  {isCreatingShareLink ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-foreground/20 border-t-accent-foreground" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Share2 className="h-4 w-4" />
                      Create Link
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      {ConfirmModal}
    </div>
  );
};
