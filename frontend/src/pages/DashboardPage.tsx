import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ErrorDisplay } from '../components/ErrorDisplay';
import { CreateGalleryModal } from '../components/dashboard/CreateGalleryModal';
import { CreateProjectModal } from '../components/dashboard/CreateProjectModal';
import { EnhancedGalleryCard } from '../components/dashboard/EnhancedGalleryCard';
import { ShareLinkSettingsModal } from '../components/share-links/ShareLinkSettingsModal';
import { AppListbox } from '../components/ui';
import { useDashboardActions } from '../hooks';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { shareLinkService } from '../services/shareLinkService';
import { projectService } from '../services/projectService';
import type { Gallery, GalleryListSortBy, Project, SortOrder } from '../types';

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

const DEFAULT_SORT_BY: GalleryListSortBy = 'created_at';
const DEFAULT_SORT_ORDER: SortOrder = 'desc';
const SEARCH_DEBOUNCE_MS = 300;
const DASHBOARD_SORT_OPTIONS: { value: GalleryListSortBy; label: string }[] = [
  { value: 'created_at', label: 'Date created' },
  { value: 'shooting_date', label: 'Shooting date' },
  { value: 'name', label: 'Name' },
  { value: 'photo_count', label: 'Photo count' },
  { value: 'total_size_bytes', label: 'Size' },
];
const DASHBOARD_ORDER_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'desc', label: 'Descending' },
  { value: 'asc', label: 'Ascending' },
];

const isDashboardSortBy = (value: string | null): value is GalleryListSortBy =>
  value === 'created_at' ||
  value === 'shooting_date' ||
  value === 'name' ||
  value === 'photo_count' ||
  value === 'total_size_bytes';

const isSortOrder = (value: string | null): value is SortOrder =>
  value === 'asc' || value === 'desc';

export const DashboardPage = () => {
  useDocumentTitle('Dashboard · Viewport');
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
    goToPage,
  } = pagination;

  const [searchParams, setSearchParams] = useSearchParams();

  const urlSearch = searchParams.get('search') ?? '';
  const sortByParam = searchParams.get('sort_by');
  const orderParam = searchParams.get('order');
  const sortBy: GalleryListSortBy = isDashboardSortBy(sortByParam) ? sortByParam : DEFAULT_SORT_BY;
  const sortOrder: SortOrder = isSortOrder(orderParam) ? orderParam : DEFAULT_SORT_ORDER;

  const [searchInput, setSearchInput] = useState(urlSearch);
  const [newGalleryName, setNewGalleryName] = useState('');
  const [newGalleryShootingDate, setNewGalleryShootingDate] = useState('');
  const [renameGalleryId, setRenameGalleryId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [showLoadingSkeleton, setShowLoadingSkeleton] = useState(false);
  const [shareModalGallery, setShareModalGallery] = useState<Gallery | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectError, setProjectError] = useState('');
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectShootingDate, setNewProjectShootingDate] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const newGalleryInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLTextAreaElement>(null);
  const newProjectInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchGalleries({
      page,
      size: pageSize,
      search: urlSearch.trim() || undefined,
      sort_by: sortBy,
      order: sortOrder,
      standalone_only: true,
    });
  }, [fetchGalleries, page, pageSize, sortBy, sortOrder, urlSearch]);

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  const fetchProjects = useCallback(async () => {
    try {
      setProjectError('');
      const response = await projectService.getProjects(1, 50, urlSearch.trim() || undefined);
      setProjects(response.projects);
    } catch (err: unknown) {
      setProjectError((err as Error)?.message || 'Failed to load projects');
    }
  }, [urlSearch]);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

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

  useEffect(() => {
    if (isProjectModalOpen) {
      newProjectInputRef.current?.focus();
    }
  }, [isProjectModalOpen]);

  const handleOpenProjectModal = () => {
    setNewProjectName('');
    setNewProjectShootingDate(new Date().toISOString().slice(0, 10));
    setProjectError('');
    setIsProjectModalOpen(true);
  };

  const handleConfirmCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      setIsCreatingProject(true);
      await projectService.createProject({
        name: newProjectName.trim(),
        shooting_date: newProjectShootingDate || undefined,
      });
      setIsProjectModalOpen(false);
      await fetchProjects();
    } catch (err: unknown) {
      setProjectError((err as Error)?.message || 'Failed to create project');
    } finally {
      setIsCreatingProject(false);
    }
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
  };

  const handleCloseShareModal = () => {
    setShareModalGallery(null);
  };

  const handleCreateShareLinkFromModal = async (payload: {
    label?: string | null;
    is_active?: boolean;
    expires_at?: string | null;
  }) => {
    if (!shareModalGallery) {
      throw new Error('Gallery is unavailable.');
    }

    const created = await shareLinkService.createShareLink(shareModalGallery.id, payload);
    await fetchGalleries();
    return created;
  };

  const handleSortByChange = (value: GalleryListSortBy) => {
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
      <h3 className="mb-2 text-2xl font-semibold text-text">No standalone galleries yet</h3>
      <p className="mx-auto mb-8 max-w-md text-lg text-muted">
        Create a standalone gallery for quick uploads or add a gallery inside a project.
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

          {galleries.map((gallery) => (
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
            Projects & Galleries
          </h1>
          <p className="font-cuprum text-lg text-muted">
            Organize galleries inside projects, or keep standalone galleries for quick work.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleOpenProjectModal}
            disabled={isCreatingProject}
            className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface px-5 py-2.5 font-semibold text-text shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            aria-label="Create new project"
          >
            {isCreatingProject ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-text/20 border-t-text" />
            ) : (
              <Plus className="h-5 w-5" />
            )}
            New Project
          </button>
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

        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm dark:bg-surface-dark">
          <span className="text-muted">Sort:</span>
          <AppListbox
            value={sortBy}
            onChange={handleSortByChange}
            options={DASHBOARD_SORT_OPTIONS}
            aria-label="Sort galleries by"
            buttonClassName="min-w-0 border-none bg-transparent px-0 py-0 text-text shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            optionsClassName="bg-surface p-1 dark:bg-surface-dark-1"
          />
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm dark:bg-surface-dark">
          <span className="text-muted">Order:</span>
          <AppListbox
            value={sortOrder}
            onChange={handleSortOrderChange}
            options={DASHBOARD_ORDER_OPTIONS}
            aria-label="Sort order"
            buttonClassName="min-w-0 border-none bg-transparent px-0 py-0 text-text shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            optionsClassName="bg-surface p-1 dark:bg-surface-dark-1"
          />
        </div>
      </div>

      {projectError ? (
        <ErrorDisplay
          error={projectError}
          onRetry={fetchProjects}
          onDismiss={() => setProjectError('')}
          variant="banner"
        />
      ) : null}
      {error && renderError()}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-text">Projects</h2>
            <p className="text-sm text-muted">
              Project-wide shares show only galleries marked visible.
            </p>
          </div>
        </div>
        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/40 bg-surface-1/50 px-4 py-8 text-sm text-muted">
            No projects yet. Create a project to group related galleries.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => navigate(`/projects/${project.id}`)}
                className="rounded-2xl border border-border/40 bg-surface p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 dark:bg-surface-dark"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                  Project
                </p>
                <h3 className="mt-2 font-oswald text-2xl font-bold uppercase tracking-wide text-text">
                  {project.name}
                </h3>
                <div className="mt-4 flex flex-wrap gap-2 text-sm text-muted">
                  <span className="rounded-xl border border-border/40 bg-surface-1 px-3 py-2">
                    {project.folder_count} galleries
                  </span>
                  <span className="rounded-xl border border-border/40 bg-surface-1 px-3 py-2">
                    {project.total_photo_count} photos
                  </span>
                  <span className="rounded-xl border border-border/40 bg-surface-1 px-3 py-2">
                    {project.has_active_share_links ? 'Share active' : 'No share link'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold text-text">Standalone galleries</h2>
          <p className="text-sm text-muted">These galleries are not assigned to a project yet.</p>
        </div>

        {isLoading && showLoadingSkeleton
          ? renderLoading()
          : isLoading
            ? null
            : galleries.length === 0
              ? renderEmptyState()
              : renderGalleryGrid()}
      </section>

      <AnimatePresence>
        <CreateProjectModal
          isOpen={isProjectModalOpen}
          isCreating={isCreatingProject}
          name={newProjectName}
          shootingDate={newProjectShootingDate}
          inputRef={newProjectInputRef}
          onClose={() => setIsProjectModalOpen(false)}
          onConfirm={() => void handleConfirmCreateProject()}
          onNameChange={setNewProjectName}
          onShootingDateChange={setNewProjectShootingDate}
        />
      </AnimatePresence>

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
          <ShareLinkSettingsModal
            isOpen
            mode="create"
            galleryName={shareModalGallery.name}
            onClose={handleCloseShareModal}
            onCreate={handleCreateShareLinkFromModal}
            onSaveSelectionConfig={(shareLinkId, payload) =>
              shareLinkService.updateOwnerSelectionConfig(
                shareModalGallery.id,
                shareLinkId,
                payload,
              )
            }
            onManageCreated={(shareLinkId) => navigate(`/share-links/${shareLinkId}`)}
          />
        ) : null}
      </AnimatePresence>

      {ConfirmModal}
    </div>
  );
};
