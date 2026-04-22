import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
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
          className="overflow-hidden rounded-[28px] border border-border/50 bg-surface-1/70 animate-pulse dark:border-border/40 dark:bg-surface-dark-1/60"
        >
          <div className="h-56 bg-surface-2/70 dark:bg-surface-dark-2/70" />
          <div className="space-y-3 p-5">
            <div className="h-6 w-3/4 rounded bg-muted/20 dark:bg-muted-dark/20" />
            <div className="h-4 w-1/2 rounded bg-muted/20 dark:bg-muted-dark/20" />
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
        Create a project to start uploading photos into its first gallery right away.
      </p>
      <button
        type="button"
        onClick={handleOpenProjectModal}
        disabled={isCreatingProject}
        className="inline-flex items-center gap-2 rounded-xl bg-accent px-8 py-3 font-semibold text-accent-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        aria-label="Create your first project"
      >
        {isCreatingProject ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-foreground/20 border-t-accent-foreground" />
        ) : (
          <Plus className="h-5 w-5" />
        )}
        Create First Project
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      <DashboardHeader
        isCreatingProject={isCreatingProject}
        onCreateProject={handleOpenProjectModal}
        onSearchChange={setSearchInput}
        searchValue={searchInput}
      />

      {error ? (
        <ErrorDisplay
          error={error}
          onRetry={fetchProjects}
          onDismiss={() => setError('')}
          variant="banner"
        />
      ) : null}

      <section className="space-y-4" aria-label="Project dashboard content">
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
                {projects.map((project) => (
                  <ProjectDashboardCard
                    key={project.id}
                    project={project}
                    variants={cardVariants}
                    onOpen={() => navigate(resolveProjectPath(project))}
                  />
                ))}
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
