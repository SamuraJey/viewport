import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Search, Trash2 } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ErrorDisplay } from '../components/ErrorDisplay';
import { PaginationControls } from '../components/PaginationControls';
import { CollectionCard, CollectionShareBadge } from '../components/dashboard/CollectionCard';
import { getCollectionTitleTextSizeClass } from '../components/dashboard/collectionCardUtils';
import { CreateProjectModal } from '../components/dashboard/CreateProjectModal';
import { useConfirmation, usePagination } from '../hooks';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { handleApiError } from '../lib/errorHandling';
import { formatFileSize } from '../lib/utils';
import { projectService } from '../services/projectService';
import type { Project } from '../types';

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

const SEARCH_DEBOUNCE_MS = 300;
const PROJECT_PAGE_SIZE = 18;

const resolveProjectPath = (project: Project) => `/projects/${project.id}`;

const formatCountLabel = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

export const DashboardPage = () => {
  useDocumentTitle('Projects · Viewport');

  const navigate = useNavigate();
  const { openConfirm, ConfirmModal } = useConfirmation();
  const pagination = usePagination({ pageSize: PROJECT_PAGE_SIZE, syncWithUrl: true });
  const { page, pageSize, setTotal } = pagination;
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectShootingDate, setNewProjectShootingDate] = useState('');
  const newProjectInputRef = useRef<HTMLInputElement>(null);

  const activeSearch = useMemo(() => searchParams.get('search')?.trim() ?? '', [searchParams]);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await projectService.getProjects(page, pageSize, activeSearch || undefined);
      setProjects(response.projects);
      setTotal(response.total);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  }, [activeSearch, page, pageSize, setTotal]);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    setSearchInput(activeSearch);
  }, [activeSearch]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const normalized = searchInput.trim();
      if (normalized === activeSearch) {
        return;
      }

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
  }, [activeSearch, searchInput, searchParams, setSearchParams]);

  useEffect(() => {
    if (isProjectModalOpen) {
      newProjectInputRef.current?.focus();
    }
  }, [isProjectModalOpen]);

  const handleOpenProjectModal = () => {
    setNewProjectName('');
    setNewProjectShootingDate(new Date().toISOString().slice(0, 10));
    setError('');
    setIsProjectModalOpen(true);
  };

  const handleConfirmCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      setIsCreatingProject(true);
      const project = await projectService.createProject({
        name: newProjectName.trim(),
        shooting_date: newProjectShootingDate || undefined,
      });
      setIsProjectModalOpen(false);
      await fetchProjects();
      navigate(resolveProjectPath(project));
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to create project');
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleDeleteProject = (project: Project) => {
    openConfirm({
      title: 'Delete project?',
      message: `Are you sure you want to delete "${project.name}" and all of its galleries? This action cannot be undone.`,
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await projectService.deleteProject(project.id);
          await fetchProjects();
        } catch (err) {
          setError(handleApiError(err).message || 'Failed to delete project');
          throw err;
        }
      },
    });
  };

  const renderLoading = () => (
    <div className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(20rem,1fr))]">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="w-full animate-pulse overflow-hidden rounded-3xl border border-border/80 bg-surface shadow-sm dark:border-border/60 dark:bg-surface-dark"
        >
          <div className="h-52 bg-muted/20 dark:bg-muted-dark/20" />
          <div className="space-y-3 p-5">
            <div className="h-6 w-3/4 rounded bg-muted/20 dark:bg-muted-dark/20" />
            <div className="h-4 w-2/3 rounded bg-muted/20 dark:bg-muted-dark/20" />
            <div className="h-8 w-28 rounded-full bg-muted/20 dark:bg-muted-dark/20" />
          </div>
        </div>
      ))}
    </div>
  );

  const renderEmptyState = () => (
    <div className="rounded-3xl border border-dashed border-border bg-surface-1/50 px-4 py-24 text-center dark:border-border/40 dark:bg-surface-dark-1/50">
      <div className="mb-6 inline-flex rounded-full bg-accent/10 p-4">
        <Plus className="h-8 w-8 text-accent" />
      </div>
      <h2 className="mb-2 text-2xl font-semibold text-text">No projects yet</h2>
      <p className="mx-auto mb-8 max-w-md text-lg text-muted">
        Create your first project to upload photos, organize galleries, and share polished
        deliveries with clients.
      </p>
      <button
        type="button"
        onClick={handleOpenProjectModal}
        disabled={isCreatingProject}
        className="inline-flex items-center gap-2 rounded-xl bg-accent px-8 py-3 font-semibold text-accent-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        aria-label="Create your first project"
      >
        {isCreatingProject ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-foreground/20 border-t-accent-foreground" />
        ) : (
          <Plus className="h-5 w-5" />
        )}
        Create your first project
      </button>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8">
      <header className="rounded-3xl border border-border/75 bg-surface p-5 shadow-sm dark:border-border/55 dark:bg-surface-dark">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(23rem,30rem)] xl:items-center">
          <div className="max-w-xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-accent/80">
              Portfolio workspace
            </p>
            <h1 className="font-oswald text-4xl font-bold uppercase tracking-wider text-text">
              Projects
            </h1>
            <p className="mt-3 max-w-lg font-cuprum text-lg text-muted">
              Manage your client projects and galleries.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <label
              htmlFor="dashboard-project-search"
              className="relative flex h-11 flex-1 items-center rounded-2xl border border-border bg-surface-1 px-3 shadow-sm dark:border-border/60 dark:bg-surface-dark-1"
            >
              <Search className="mr-2 h-4 w-4 text-muted" />
              <input
                id="dashboard-project-search"
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search projects..."
                className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
                aria-label="Search projects"
              />
            </label>
            <button
              type="button"
              onClick={handleOpenProjectModal}
              disabled={isCreatingProject}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-accent px-4 font-semibold text-accent-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              aria-label="Create new project"
            >
              {isCreatingProject ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-foreground/20 border-t-accent-foreground" />
              ) : (
                <Plus className="h-5 w-5" />
              )}
              Create
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <ErrorDisplay
          error={error}
          onRetry={fetchProjects}
          onDismiss={() => setError('')}
          variant="banner"
        />
      ) : null}

      <section aria-label="Projects grid">
        {isLoading ? (
          renderLoading()
        ) : projects.length === 0 ? (
          renderEmptyState()
        ) : (
          <>
            <motion.div
              className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(20rem,1fr))]"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <AnimatePresence mode="popLayout">
                {projects.map((project) => {
                  const coverUrl = project.cover_photo_thumbnail_url ?? null;
                  const titleTextSizeClass = getCollectionTitleTextSizeClass(project.name);
                  return (
                    <CollectionCard
                      key={project.id}
                      variants={cardVariants}
                      cover={
                        coverUrl ? (
                          <>
                            <img
                              src={coverUrl}
                              alt=""
                              aria-hidden="true"
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
                        <>{project.has_active_share_links ? <CollectionShareBadge /> : null}</>
                      }
                      topRightOverlay={
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleDeleteProject(project);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-sm transition-all duration-200 hover:bg-danger hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-danger"
                          title="Delete Project"
                          aria-label={`Delete project ${project.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      }
                      bodyClassName="flex flex-1 flex-col p-4"
                      body={
                        <Link
                          to={resolveProjectPath(project)}
                          className="flex flex-1 flex-col justify-center gap-4 no-underline transition-colors"
                        >
                          <div className="group/title relative w-full text-left">
                            <div className="min-w-0 flex-1">
                              <h2
                                className={`wrap-anywhere whitespace-normal font-oswald ${titleTextSizeClass} font-bold uppercase text-text transition-colors`}
                              >
                                {project.name}
                              </h2>
                            </div>
                          </div>
                          <p className="rounded-full border border-border/55 bg-surface-1 px-3 py-2 text-sm text-muted dark:border-border/45 dark:bg-surface-dark-1">
                            {formatCountLabel(project.gallery_count, 'gallery', 'galleries')} •{' '}
                            {formatCountLabel(project.total_photo_count, 'photo')} •{' '}
                            {formatFileSize(project.total_size_bytes)}
                          </p>
                        </Link>
                      }
                    />
                  );
                })}
              </AnimatePresence>
            </motion.div>
            <PaginationControls pagination={pagination} isLoading={isLoading} />
          </>
        )}
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
      {ConfirmModal}
    </div>
  );
};
