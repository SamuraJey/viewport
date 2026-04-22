import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Plus, Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ErrorDisplay } from '../components/ErrorDisplay';
import { PaginationControls } from '../components/PaginationControls';
import { CreateProjectModal } from '../components/dashboard/CreateProjectModal';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { ProjectDashboardCard } from '../components/dashboard/ProjectDashboardCard';
import { usePagination } from '../hooks';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
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

const getProjectGalleryCount = (project: Project) =>
  project.gallery_count ?? project.folder_count ?? 0;
const formatCountLabel = (count: number, singular: string) =>
  `${count} ${count === 1 ? singular : `${singular}s`}`;

export const DashboardPage = () => {
  useDocumentTitle('Projects · Viewport');

  const navigate = useNavigate();
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

  const renderLoading = () => (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse overflow-hidden rounded-3xl border border-border/70 bg-surface-1 shadow-sm dark:border-border/50 dark:bg-surface-dark-1"
        >
          <div className="h-48 bg-muted/20 dark:bg-muted-dark/20" />
          <div className="space-y-3 p-5">
            <div className="h-4 w-3/4 rounded bg-muted/20 dark:bg-muted-dark/20" />
            <div className="h-3 w-2/3 rounded bg-muted/20 dark:bg-muted-dark/20" />
            <div className="h-3 w-24 rounded bg-muted/20 dark:bg-muted-dark/20" />
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
      <h2 className="mb-2 text-2xl font-semibold text-text">Start your first project</h2>
      <p className="mx-auto mb-8 max-w-md text-lg text-muted">
        Create a project to begin organizing galleries, uploads, and delivery in one place.
      </p>
      <button
        type="button"
        onClick={handleOpenProjectModal}
        disabled={isCreatingProject}
        className="inline-flex items-center gap-2 rounded-xl bg-accent px-8 py-3 font-semibold text-accent-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        aria-label="Create new project"
      >
        {isCreatingProject ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-foreground/20 border-t-accent-foreground" />
        ) : (
          <Plus className="h-5 w-5" />
        )}
        Create new project
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="rounded-3xl border border-border/70 bg-surface-1/70 p-6 shadow-sm dark:border-border/50 dark:bg-surface-dark-1/70">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-accent/80">
              Portfolio workspace
            </p>
            <h1 className="font-oswald text-4xl font-bold uppercase tracking-wider text-text">
              Projects
            </h1>
            <p className="mt-3 max-w-xl font-cuprum text-lg text-muted">
              Browse every client delivery, reopen the right gallery set fast, and start the next
              project from the same workspace.
            </p>
          </div>

          <div className="flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <label
              htmlFor="dashboard-project-search"
              className="relative flex flex-1 items-center rounded-2xl border border-border bg-surface px-3 py-3 shadow-sm dark:bg-surface-dark"
            >
              <Search className="mr-2 h-4 w-4 text-muted" />
              <input
                id="dashboard-project-search"
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search by project name"
                className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
                aria-label="Search projects by project name"
              />
            </label>
            <button
              onClick={handleOpenProjectModal}
              disabled={isCreatingProject}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-3 font-semibold text-accent-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              aria-label="Create new project"
            >
              {isCreatingProject ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-foreground/20 border-t-accent-foreground" />
              ) : (
                <Plus className="h-5 w-5" />
              )}
              Create new project
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
              className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <AnimatePresence mode="popLayout">
                {projects.map((project) => {
                  const galleryCount = getProjectGalleryCount(project);
                  const coverUrl = project.recent_folder_thumbnail_urls[0] ?? null;
                  return (
                    <motion.button
                      key={project.id}
                      layout
                      variants={cardVariants}
                      type="button"
                      onClick={() => navigate(resolveProjectPath(project))}
                      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-card-border/80 bg-card-bg text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                    >
                      <div className="relative h-48 overflow-hidden bg-surface-2 dark:bg-surface-dark-2">
                        {coverUrl ? (
                          <>
                            <img
                              src={coverUrl}
                              alt=""
                              aria-hidden="true"
                              className="absolute inset-0 h-full w-full object-cover opacity-70 transition-transform duration-500 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-linear-to-b from-black/10 via-black/5 to-black/30" />
                          </>
                        ) : (
                          <div className="absolute inset-0 bg-linear-to-br from-surface-2 via-surface-1 to-surface dark:from-surface-dark-2 dark:via-surface-dark-1 dark:to-surface-dark" />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col justify-between gap-4 p-5">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <h2 className="line-clamp-2 font-oswald text-2xl font-bold uppercase tracking-wide text-text">
                              {project.name}
                            </h2>
                            {project.has_active_share_links ? (
                              <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                                Share active
                              </span>
                            ) : null}
                          </div>
                          <p className="text-sm text-muted">
                            {formatCountLabel(galleryCount, 'gallery')} •{' '}
                            {formatCountLabel(project.total_photo_count, 'photo')}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-2 text-sm font-semibold text-accent">
                          Open project
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>
                    </motion.button>
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
    </div>
  );
};
