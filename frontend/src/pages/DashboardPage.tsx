import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, GripVertical, Plus, Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';

import { DashboardEmptyState } from '../components/dashboard/DashboardEmptyState';
import { CreateProjectModal } from '../components/dashboard/CreateProjectModal';
import { RenameProjectModal } from '../components/dashboard/RenameProjectModal';
import { SortableProjectGrid } from '../components/dashboard/SortableProjectGrid';
import { ErrorDisplay } from '../components/ErrorDisplay';
import { PaginationControls } from '../components/PaginationControls';
import { AppListbox, Skeleton } from '../components/ui';
import { requestProjectAction } from '../components/command/commandActions';
import { useConfirmation } from '../hooks/useConfirmation';
import { useCreateProjectModal, useRenameProjectModal } from '../hooks/useDashboardProjectModals';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { usePagination } from '../hooks/usePagination';
import { usePendingAction } from '../hooks/usePendingAction';
import { copyTextToClipboard } from '../lib/clipboard';
import { handleApiError } from '../lib/errorHandling';
import { projectService } from '../services/projectService';
import { shareLinkService } from '../services/shareLinkService';
import type { Project, ProjectListSortBy, SortOrder } from '../types';

const SEARCH_DEBOUNCE_MS = 300;
const PROJECT_POLL_INTERVAL_MS = 60_000;
const PROJECT_PAGE_SIZE = 18;
const DEFAULT_PROJECT_SORT_BY: ProjectListSortBy = 'manual_order';
const DEFAULT_PROJECT_SORT_ORDER: SortOrder = 'asc';

interface ProjectSortOption {
  value: `${ProjectListSortBy}:${SortOrder}`;
  label: string;
}

const PROJECT_SORT_OPTIONS: ProjectSortOption[] = [
  { value: 'manual_order:asc', label: 'Manual order' },
  { value: 'created_at:desc', label: 'Date created (new to old)' },
  { value: 'created_at:asc', label: 'Date created (old to new)' },
  { value: 'shooting_date:desc', label: 'Shooting date (new to old)' },
  { value: 'shooting_date:asc', label: 'Shooting date (old to new)' },
  { value: 'name:asc', label: 'Name (A to Z)' },
  { value: 'name:desc', label: 'Name (Z to A)' },
  { value: 'photo_count:desc', label: 'Photo count (high to low)' },
  { value: 'photo_count:asc', label: 'Photo count (low to high)' },
  { value: 'total_size_bytes:desc', label: 'Size (large to small)' },
  { value: 'total_size_bytes:asc', label: 'Size (small to large)' },
];

const isProjectListSortBy = (value: string | null): value is ProjectListSortBy =>
  value === 'manual_order' ||
  value === 'created_at' ||
  value === 'shooting_date' ||
  value === 'name' ||
  value === 'photo_count' ||
  value === 'total_size_bytes';

const isSortOrder = (value: string | null): value is SortOrder =>
  value === 'asc' || value === 'desc';

const toProjectSortValue = (sortBy: ProjectListSortBy, order: SortOrder) =>
  `${sortBy}:${order}` as ProjectSortOption['value'];

const parseProjectSortValue = (value: string) => {
  const [sortBy, order] = value.split(':');
  if (!isProjectListSortBy(sortBy) || !isSortOrder(order)) {
    return { sortBy: DEFAULT_PROJECT_SORT_BY, order: DEFAULT_PROJECT_SORT_ORDER };
  }
  return { sortBy, order };
};

const sharePath = (shareLinkId: string) => `/share/${shareLinkId}`;

const copyText = async (value: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  if (!(await copyTextToClipboard(value))) {
    throw new Error('Failed to copy text to clipboard');
  }
};

export const DashboardPage = () => {
  useDocumentTitle('Projects · Viewport');

  const navigate = useNavigate();
  const { openConfirm, ConfirmModal } = useConfirmation();
  const pagination = usePagination({ pageSize: PROJECT_PAGE_SIZE, syncWithUrl: true });
  const { page, pageSize, setTotal, total, goToPage } = pagination;
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingShareLink, setIsCreatingShareLink] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const fetchRequestIdRef = useRef(0);
  const isReorderingRef = useRef(false);
  const fetchProjectsRef = useRef<(showLoading?: boolean) => Promise<void>>(async () => undefined);

  const activeSearch = useMemo(() => searchParams.get('search')?.trim() ?? '', [searchParams]);
  const sortByParam = searchParams.get('sort_by');
  const orderParam = searchParams.get('order');
  const activeSortBy: ProjectListSortBy = isProjectListSortBy(sortByParam)
    ? sortByParam
    : DEFAULT_PROJECT_SORT_BY;
  const activeSortOrder: SortOrder = isSortOrder(orderParam)
    ? orderParam
    : DEFAULT_PROJECT_SORT_ORDER;
  const activeSortValue = toProjectSortValue(activeSortBy, activeSortOrder);
  const canReorder = activeSortBy === 'manual_order' && activeSortOrder === 'asc';

  const fetchProjects = useCallback(
    async (showLoading = true) => {
      if (!showLoading && isReorderingRef.current) return;
      const requestId = ++fetchRequestIdRef.current;
      if (showLoading) setIsLoading(true);
      setError('');
      try {
        const response = await projectService.getProjects(page, pageSize, {
          search: activeSearch || undefined,
          sort_by: activeSortBy,
          order: activeSortOrder,
        });
        if (requestId !== fetchRequestIdRef.current || isReorderingRef.current) return;
        setProjects(response.projects);
        setTotal(response.total);
      } catch (err: unknown) {
        if (requestId !== fetchRequestIdRef.current) return;
        setError(handleApiError(err).message || 'Failed to load projects');
      } finally {
        if (requestId === fetchRequestIdRef.current) setIsLoading(false);
      }
    },
    [activeSearch, activeSortBy, activeSortOrder, page, pageSize, setTotal],
  );
  fetchProjectsRef.current = fetchProjects;

  const createProjectModal = useCreateProjectModal({
    onCreated: (project) => navigate(`/projects/${project.id}`),
    onError: setError,
  });
  const renameProjectModal = useRenameProjectModal({
    onError: setError,
    onSaved: () => fetchProjectsRef.current(false),
  });

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchProjects(false);
    }, PROJECT_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [fetchProjects]);

  useEffect(() => {
    setSearchInput(activeSearch);
  }, [activeSearch]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const normalized = searchInput.trim();
      if (normalized === activeSearch) return;
      const nextParams = new URLSearchParams(searchParams);
      if (normalized) nextParams.set('search', normalized);
      else nextParams.delete('search');
      nextParams.delete('page');
      setSearchParams(nextParams);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [activeSearch, searchInput, searchParams, setSearchParams]);

  usePendingAction((action) => {
    if (action === 'create-project') createProjectModal.open();
  });

  const updateSort = ({ sortBy, order }: { sortBy: ProjectListSortBy; order: SortOrder }) => {
    const nextParams = new URLSearchParams(searchParams);
    if (sortBy === DEFAULT_PROJECT_SORT_BY) nextParams.delete('sort_by');
    else nextParams.set('sort_by', sortBy);
    if (order === DEFAULT_PROJECT_SORT_ORDER) nextParams.delete('order');
    else nextParams.set('order', order);
    nextParams.delete('page');
    setSearchParams(nextParams);
  };

  const handleDeleteProject = (project: Project) => {
    openConfirm({
      title: 'Delete project?',
      message: `Delete “${project.name}” and all of its galleries? This action cannot be undone.`,
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        await projectService.deleteProject(project.id);
        const nextTotal = Math.max(0, total - 1);
        const lastPage = Math.max(1, Math.ceil(nextTotal / pageSize));
        if (page > lastPage) goToPage(lastPage);
        else await fetchProjects(false);
      },
    });
  };

  const handleReorder = async (reordered: Project[]) => {
    if (isReorderingRef.current) return;
    isReorderingRef.current = true;
    setIsReordering(true);
    fetchRequestIdRef.current += 1;
    setProjects(reordered);
    let failureMessage = '';
    try {
      await projectService.reorderProjects(reordered.map((project) => project.id));
    } catch (err) {
      failureMessage = handleApiError(err).message || 'Failed to save project order';
    } finally {
      isReorderingRef.current = false;
      setIsReordering(false);
      await fetchProjectsRef.current(false);
    }
    if (failureMessage) {
      setAnnouncement('Project order could not be saved. The latest project list was reloaded.');
      setError(failureMessage);
    }
  };

  const handleCopyLink = async (project: Project) => {
    if (!project.latest_share_link_id) return;
    try {
      await copyText(`${window.location.origin}${sharePath(project.latest_share_link_id)}`);
      setAnnouncement(`Latest share link for ${project.name} copied.`);
    } catch (err) {
      setAnnouncement('');
      setError(handleApiError(err).message || 'Failed to copy project share link');
    }
  };

  const handleOpenShare = (project: Project) => {
    if (project.latest_share_link_id) navigate(sharePath(project.latest_share_link_id));
  };

  const handleCreateShareLink = async (project: Project) => {
    if (isCreatingShareLink) return;
    setIsCreatingShareLink(true);
    try {
      const link = await shareLinkService.createProjectShareLink(project.id, {
        expires_at: null,
      });
      let copyFailure = '';
      try {
        await copyText(`${window.location.origin}${sharePath(link.id)}`);
        setAnnouncement(`Share link for ${project.name} created and copied.`);
      } catch (err) {
        const detail = handleApiError(err).message;
        copyFailure = detail
          ? `Share link created, but copy failed: ${detail}`
          : 'Share link created, but failed to copy it';
        setAnnouncement(`Share link for ${project.name} was created, but could not be copied.`);
      }
      await fetchProjects(false);
      if (copyFailure) setError(copyFailure);
    } catch (err) {
      setError(handleApiError(err).message || 'Failed to create project share link');
    } finally {
      setIsCreatingShareLink(false);
    }
  };

  const renderLoading = () => (
    <div
      className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
      role="status"
      aria-live="polite"
      aria-label="Loading projects"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-border/45 dark:bg-surface-dark dark:ring-border/35"
        >
          <Skeleton className="aspect-[16/9] rounded-none" />
          <div className="space-y-3 p-4">
            <Skeleton className="h-6 w-2/3 rounded bg-muted/15" />
            <Skeleton className="h-4 w-1/2 rounded bg-muted/15" />
          </div>
          <div className="grid grid-cols-3 divide-x divide-border/40 border-t border-border/40">
            {Array.from({ length: 3 }).map((__, metricIndex) => (
              <Skeleton
                key={metricIndex}
                className="h-15 rounded-none bg-surface-1 dark:bg-surface-dark-1"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-7">
      <header className="flex flex-col gap-5 border-b border-border/45 pb-6 lg:flex-row lg:items-end lg:justify-between dark:border-border/35">
        <div>
          <h1 className="text-4xl font-bold tracking-[-0.03em] text-text sm:text-5xl">Projects</h1>
          <p className="mt-2 max-w-2xl text-base leading-7 text-muted">
            Your proofing workspace, ordered around the deliveries that need attention.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <label
            htmlFor="dashboard-project-search"
            className="flex h-11 min-w-0 flex-1 items-center rounded-xl bg-surface px-3 shadow-control ring-1 ring-border/55 focus-within:ring-[3px] focus-within:ring-accent dark:bg-surface-dark dark:ring-border/40 sm:w-64"
          >
            <Search className="mr-2 h-4 w-4 text-muted" aria-hidden="true" />
            <input
              id="dashboard-project-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search projects"
              className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
              aria-label="Search projects"
            />
          </label>
          <AppListbox
            value={activeSortValue}
            onChange={(value) => updateSort(parseProjectSortValue(value))}
            options={PROJECT_SORT_OPTIONS}
            className="min-w-0 flex-1 sm:w-64 sm:flex-none"
            aria-label="Sort projects"
            startContent={<ArrowUpDown className="h-4 w-4 text-muted" aria-hidden="true" />}
            buttonClassName="h-11 border border-border/55 bg-surface px-3 text-sm font-semibold text-text shadow-control dark:border-border/40 dark:bg-surface-dark"
          />
          <button
            type="button"
            onClick={createProjectModal.open}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 font-bold text-accent-foreground shadow-[0_8px_20px_rgba(31,144,255,0.22)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transform-none"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New project
          </button>
        </div>
      </header>

      {error ? (
        <ErrorDisplay
          error={error}
          onRetry={() => void fetchProjects()}
          onDismiss={() => setError('')}
          variant="banner"
        />
      ) : null}

      {!isLoading && projects.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <p>
            {total} {total === 1 ? 'project' : 'projects'}
            {activeSearch ? ` matching “${activeSearch}”` : ''}
          </p>
          {canReorder ? (
            <p className="inline-flex items-center gap-2">
              <GripVertical className="h-4 w-4" aria-hidden="true" />
              Drag the handle or use Space and arrow keys to reorder.
            </p>
          ) : (
            <button
              type="button"
              onClick={() =>
                updateSort({ sortBy: DEFAULT_PROJECT_SORT_BY, order: DEFAULT_PROJECT_SORT_ORDER })
              }
              className="font-semibold text-accent hover:underline focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent"
            >
              Switch to manual order to drag projects
            </button>
          )}
        </div>
      ) : null}

      <section aria-label="Projects grid" aria-busy={isReordering}>
        {isLoading ? (
          renderLoading()
        ) : projects.length === 0 ? (
          <DashboardEmptyState
            hasSearch={Boolean(activeSearch)}
            searchTerm={activeSearch}
            onCreateProject={createProjectModal.open}
            onClearSearch={() => setSearchInput('')}
          />
        ) : (
          <>
            <SortableProjectGrid
              projects={projects}
              disabled={!canReorder || isReordering}
              onReorder={(reordered) => void handleReorder(reordered)}
              onAnnouncement={setAnnouncement}
              onCopyLink={(project) => void handleCopyLink(project)}
              onOpenProject={(project) => navigate(`/projects/${project.id}`)}
              onOpenShare={handleOpenShare}
              onRename={renameProjectModal.open}
              onAddGallery={(project) =>
                requestProjectAction(navigate, project.id, 'create-gallery')
              }
              onCreateShareLink={(project) => void handleCreateShareLink(project)}
              onSettings={(project) =>
                requestProjectAction(navigate, project.id, 'project-settings')
              }
              onDelete={handleDeleteProject}
            />
            <PaginationControls pagination={pagination} isLoading={isLoading} />
          </>
        )}
      </section>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <CreateProjectModal
        isOpen={createProjectModal.isOpen}
        isCreating={createProjectModal.isCreating}
        name={createProjectModal.name}
        shootingDate={createProjectModal.shootingDate}
        inputRef={createProjectModal.inputRef}
        onClose={createProjectModal.close}
        onConfirm={() => void createProjectModal.save()}
        onNameChange={createProjectModal.setName}
        onShootingDateChange={createProjectModal.setShootingDate}
      />
      <RenameProjectModal
        open={renameProjectModal.isOpen}
        projectName={renameProjectModal.project?.name ?? ''}
        value={renameProjectModal.value}
        isSaving={renameProjectModal.isSaving}
        onChange={renameProjectModal.setValue}
        onClose={renameProjectModal.close}
        onSave={() => void renameProjectModal.save()}
      />
      {ConfirmModal}
    </div>
  );
};
