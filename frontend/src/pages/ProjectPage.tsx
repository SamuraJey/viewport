import {
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  FolderPlus,
  HardDrive,
  ImageIcon,
  Link2,
  ListChecks,
  Loader2,
  PencilLine,
  Share2,
} from 'lucide-react';
import { MetricCard } from '../components/dashboard/MetricCard';
import { ShareLinksSection } from '../components/gallery/ShareLinksSection';
import { AppDialog, AppDialogDescription, AppDialogTitle, AppTabs } from '../components/ui';
import { GALLERY_NAME_MAX_LENGTH } from '../constants/gallery';
import { ShareLinkEditorModal } from '../components/share-links/ShareLinkEditorModal';
import { ShareLinkSettingsModal } from '../components/share-links/ShareLinkSettingsModal';
import { useConfirmation } from '../hooks/useConfirmation';
import { handleApiError } from '../lib/errorHandling';
import { formatDateOnly, formatFileSize } from '../lib/utils';
import { galleryService } from '../services/galleryService';
import { projectService } from '../services/projectService';
import { shareLinkService } from '../services/shareLinkService';
import type {
  Gallery,
  GalleryPhoto,
  ProjectDetail,
  ProjectGallerySummary,
  ShareLink,
} from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

import type { GalleryDraft } from '../components/project-page/types';
import { buildGalleryDraft } from '../components/project-page/utils';
import { ProjectGalleriesPanel } from '../components/project-page/components/ProjectGalleriesPanel';
import { ProjectAppearanceSection } from '../components/appearance/ProjectAppearanceSection';

export const ProjectPage = () => {
  const { id } = useParams<{ id: string }>();
  const projectId = id!;
  const navigate = useNavigate();
  const { openConfirm, ConfirmModal } = useConfirmation();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [warningShareLinks, setWarningShareLinks] = useState<ShareLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isGalleryDialogOpen, setIsGalleryDialogOpen] = useState(false);
  const [galleryDraft, setGalleryDraft] = useState<GalleryDraft>(() => buildGalleryDraft());
  const [isCreatingGallery, setIsCreatingGallery] = useState(false);
  const [isCreatingShareLink, setIsCreatingShareLink] = useState(false);
  const [isShareLinkCreateOpen, setIsShareLinkCreateOpen] = useState(false);
  const [editingShareLink, setEditingShareLink] = useState<ShareLink | null>(null);
  const [isUpdatingGallery, setIsUpdatingGallery] = useState<string | null>(null);
  const [isReorderingGallery, setIsReorderingGallery] = useState<string | null>(null);
  const [sharingGallery, setSharingGallery] = useState<Gallery | null>(null);
  const [isProjectRenameDialogOpen, setIsProjectRenameDialogOpen] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [isRenamingProject, setIsRenamingProject] = useState(false);
  const [renameGalleryId, setRenameGalleryId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [isRenamingGallery, setIsRenamingGallery] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const projectNameInputRef = useRef<HTMLInputElement | null>(null);
  const projectTitleRef = useRef<HTMLHeadingElement | null>(null);
  const renameInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [projectTitleFontSizePx, setProjectTitleFontSizePx] = useState(40);
  const [projectPhotos, setProjectPhotos] = useState<GalleryPhoto[]>([]);
  const [isLoadingProjectPhotos, setIsLoadingProjectPhotos] = useState(false);
  const activeProjectIdRef = useRef(projectId);
  const projectPhotosRequestIdRef = useRef(0);

  const [activeTab, setActiveTab] = useState<'galleries' | 'appearance'>('galleries');

  useEffect(() => {
    activeProjectIdRef.current = projectId;
    projectPhotosRequestIdRef.current += 1;
    setProjectPhotos([]);
    setIsLoadingProjectPhotos(false);
  }, [projectId]);

  const loadProjectPhotos = useCallback(async () => {
    if (!projectId) return;

    const requestedProjectId = projectId;
    if (activeProjectIdRef.current !== requestedProjectId) return;

    const requestId = ++projectPhotosRequestIdRef.current;
    setIsLoadingProjectPhotos(true);
    try {
      const result = await projectService.getProjectPhotos(requestedProjectId, {
        limit: 100,
        offset: 0,
      });
      if (
        activeProjectIdRef.current === requestedProjectId &&
        projectPhotosRequestIdRef.current === requestId
      ) {
        setProjectPhotos(result.photos);
      }
    } catch {
      // Photos are non-critical; keep what we have
    } finally {
      if (
        activeProjectIdRef.current === requestedProjectId &&
        projectPhotosRequestIdRef.current === requestId
      ) {
        setIsLoadingProjectPhotos(false);
      }
    }
  }, [projectId]);

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      setError('');
      const [projectResponse, links, warningLinks] = await Promise.all([
        projectService.getProject(projectId),
        shareLinkService.getProjectShareLinks(projectId),
        shareLinkService.getProjectWarningShareLinks(projectId),
      ]);
      setProject(projectResponse);
      setShareLinks(links);
      setWarningShareLinks(warningLinks);
      void loadProjectPhotos();
    } catch (err) {
      setError(handleApiError(err).message || 'Failed to load project');
    } finally {
      setIsLoading(false);
    }
  }, [loadProjectPhotos, projectId]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  useDocumentTitle(project?.name ? `${project.name} · Project · Viewport` : 'Project · Viewport');

  useLayoutEffect(() => {
    const heading = projectTitleRef.current;
    if (!heading || !project?.name) {
      return;
    }

    const minSize = 20;
    const maxLines = 2;

    const recalc = () => {
      let nextSize = window.innerWidth >= 640 ? 40 : 32;
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

      setProjectTitleFontSizePx(nextSize);
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
  }, [project?.name]);

  const visibleGalleryCount = useMemo(
    () =>
      project?.galleries.filter((folder) => (folder.project_visibility ?? 'listed') === 'listed')
        .length ?? 0,
    [project?.galleries],
  );
  const directOnlyGalleryCount = (project?.gallery_count ?? 0) - visibleGalleryCount;

  const buildSelectionWarningSummary = useCallback((links: ShareLink[]) => {
    const affectedLinks = links.filter((link) => {
      const summary = link.selection_summary;
      return Boolean(
        summary && (summary.in_progress_sessions > 0 || summary.submitted_sessions > 0),
      );
    });

    const inProgressSessions = affectedLinks.reduce(
      (sum, link) => sum + (link.selection_summary?.in_progress_sessions ?? 0),
      0,
    );
    const submittedSessions = affectedLinks.reduce(
      (sum, link) => sum + (link.selection_summary?.submitted_sessions ?? 0),
      0,
    );

    return {
      affectedLinks,
      inProgressSessions,
      submittedSessions,
      totalSensitiveSessions: inProgressSessions + submittedSessions,
      hasSensitiveSessions: affectedLinks.length > 0,
    };
  }, []);

  const projectSelectionWarningSummary = useMemo(
    () => buildSelectionWarningSummary(shareLinks),
    [buildSelectionWarningSummary, shareLinks],
  );

  const deleteProjectSelectionWarningSummary = useMemo(
    () => buildSelectionWarningSummary(warningShareLinks),
    [buildSelectionWarningSummary, warningShareLinks],
  );

  const buildSelectionWarningLabel = useCallback(
    (
      summary: {
        affectedLinks: ShareLink[];
        totalSensitiveSessions: number;
        hasSensitiveSessions: boolean;
      },
      linkDescriptor: string,
    ) => {
      if (!summary.hasSensitiveSessions) {
        return '';
      }

      const sessionLabel = summary.totalSensitiveSessions === 1 ? 'session' : 'sessions';
      const linkLabel = summary.affectedLinks.length === 1 ? 'link' : 'links';
      return `${summary.totalSensitiveSessions} active/submitted selection ${sessionLabel} across ${summary.affectedLinks.length} ${linkDescriptor} ${linkLabel}`;
    },
    [],
  );

  const projectSelectionWarningLabel = useMemo(() => {
    if (!projectSelectionWarningSummary.hasSensitiveSessions) {
      return '';
    }

    return buildSelectionWarningLabel(projectSelectionWarningSummary, 'project');
  }, [buildSelectionWarningLabel, projectSelectionWarningSummary]);

  const deleteProjectSelectionWarningLabel = useMemo(
    () => buildSelectionWarningLabel(deleteProjectSelectionWarningSummary, 'share'),
    [buildSelectionWarningLabel, deleteProjectSelectionWarningSummary],
  );

  const handleCreateGallery = async () => {
    if (!galleryDraft.name.trim()) {
      return;
    }
    setIsCreatingGallery(true);
    try {
      await projectService.createProjectGallery(projectId, {
        name: galleryDraft.name.trim(),
        shooting_date: galleryDraft.shooting_date,
        project_visibility: galleryDraft.project_visibility,
      });
      setGalleryDraft(buildGalleryDraft(project));
      setIsGalleryDialogOpen(false);
      await loadProject();
    } catch (err) {
      setError(handleApiError(err).message || 'Failed to create gallery');
    } finally {
      setIsCreatingGallery(false);
    }
  };

  const handleCreateGallerySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleCreateGallery();
  };

  const openGalleryDialog = () => {
    setGalleryDraft(buildGalleryDraft(project));
    setIsGalleryDialogOpen(true);
  };

  const closeGalleryDialog = () => {
    setIsGalleryDialogOpen(false);
    setGalleryDraft(buildGalleryDraft(project));
  };

  const openProjectRenameDialog = () => {
    if (!project) return;
    setError('');
    setProjectNameDraft(project.name);
    setIsProjectRenameDialogOpen(true);
  };

  const closeProjectRenameDialog = () => {
    if (isRenamingProject) return;
    setIsProjectRenameDialogOpen(false);
    setProjectNameDraft('');
  };

  const handleRenameProject = async () => {
    if (!project) return;

    const normalizedName = projectNameDraft.trim();
    const currentName = project.name.trim();
    if (
      !normalizedName ||
      normalizedName === currentName ||
      projectNameDraft.length > GALLERY_NAME_MAX_LENGTH
    ) {
      return;
    }

    setIsRenamingProject(true);
    try {
      await projectService.updateProject(projectId, { name: normalizedName });
      setIsProjectRenameDialogOpen(false);
      setProjectNameDraft('');
      await loadProject();
    } catch (err) {
      setError(handleApiError(err).message || 'Failed to rename project');
    } finally {
      setIsRenamingProject(false);
    }
  };

  const handleRenameProjectSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleRenameProject();
  };

  const beginInlineRename = (gallery: Gallery) => {
    setError('');
    setRenameGalleryId(gallery.id);
    setRenameInput(gallery.name);
  };

  const cancelInlineRename = () => {
    setRenameGalleryId(null);
    setRenameInput('');
  };

  const handleConfirmRename = async () => {
    if (!renameGalleryId) return;
    const normalizedName = renameInput.trim();
    const currentGallery = project?.galleries.find((gallery) => gallery.id === renameGalleryId);
    const currentName = currentGallery?.name?.trim() ?? '';

    if (!normalizedName || normalizedName === currentName) {
      cancelInlineRename();
      return;
    }

    try {
      setIsRenamingGallery(true);
      await galleryService.updateGallery(renameGalleryId, { name: normalizedName });
      cancelInlineRename();
      await loadProject();
    } catch (err) {
      setError(handleApiError(err).message || 'Failed to rename gallery');
    } finally {
      setIsRenamingGallery(false);
    }
  };

  const handleGalleryVisibilityChange = async (
    folder: ProjectGallerySummary,
    visibility: 'listed' | 'direct_only',
  ) => {
    setIsUpdatingGallery(folder.id);
    try {
      await galleryService.updateGallery(folder.id, { project_visibility: visibility });
      await loadProject();
    } catch (err) {
      setError(handleApiError(err).message || 'Failed to update gallery visibility');
    } finally {
      setIsUpdatingGallery(null);
    }
  };

  const requestGalleryVisibilityChange = (
    folder: ProjectGallerySummary,
    visibility: 'listed' | 'direct_only',
  ) => {
    if (visibility !== 'direct_only' || !projectSelectionWarningSummary.hasSensitiveSessions) {
      void handleGalleryVisibilityChange(folder, visibility);
      return;
    }

    openConfirm({
      title: 'Hide gallery from project share?',
      message: `This project currently has ${projectSelectionWarningLabel}. Making "${folder.name}" direct-link-only can hide its photos from active client favorites and project proofing views.`,
      confirmText: 'Hide anyway',
      onConfirm: async () => {
        await handleGalleryVisibilityChange(folder, visibility);
      },
    });
  };

  const handleDeleteGallery = (gallery: Gallery) => {
    const deleteGallerySelectionWarningSummary = buildSelectionWarningSummary(
      warningShareLinks.filter(
        (link) => link.scope_type === 'project' || link.gallery_id === gallery.id,
      ),
    );
    const deleteGallerySelectionWarningLabel = buildSelectionWarningLabel(
      deleteGallerySelectionWarningSummary,
      'share',
    );
    const warningMessage = deleteGallerySelectionWarningSummary.hasSensitiveSessions
      ? ` This project currently has ${deleteGallerySelectionWarningLabel}. Deleting "${gallery.name || `Gallery #${gallery.id}`}" can remove photos that clients already selected from live project proofing.`
      : '';

    openConfirm({
      title: 'Delete Gallery?',
      message: `Are you sure you want to delete "${gallery.name || `Gallery #${gallery.id}`}" and all its contents? This action cannot be undone.${warningMessage}`,
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await galleryService.deleteGallery(gallery.id);
          await loadProject();
        } catch (err) {
          setError(handleApiError(err).message || 'Failed to delete gallery');
          throw err;
        }
      },
    });
  };

  const handleReorderGallery = async (galleryId: string, targetIndex: number) => {
    if (!project) {
      return;
    }

    const currentIndex = project.galleries.findIndex((gallery) => gallery.id === galleryId);
    if (currentIndex === -1) {
      return;
    }

    const boundedTargetIndex = Math.max(0, Math.min(targetIndex, project.galleries.length - 1));
    if (boundedTargetIndex === currentIndex) {
      return;
    }

    const reorderedGalleries = [...project.galleries];
    const [movedGallery] = reorderedGalleries.splice(currentIndex, 1);
    reorderedGalleries.splice(boundedTargetIndex, 0, movedGallery);

    const updates = reorderedGalleries
      .map((gallery, index) => ({ gallery, index }))
      .filter(({ gallery, index }) => (gallery.project_position ?? 0) !== index);

    if (updates.length === 0) {
      return;
    }

    setIsReorderingGallery(galleryId);
    try {
      await projectService.reorderProjectGalleries(
        projectId,
        reorderedGalleries.map((folder) => folder.id),
      );
      await loadProject();
    } catch (err) {
      setError(handleApiError(err).message || 'Failed to reorder galleries');
    } finally {
      setIsReorderingGallery(null);
    }
  };

  const requestReorderGallery = (folder: ProjectGallerySummary, targetIndex: number) => {
    if (!project) {
      return;
    }

    const currentIndex = project.galleries.findIndex(
      (projectFolder) => projectFolder.id === folder.id,
    );
    if (currentIndex === -1 || currentIndex === targetIndex) {
      return;
    }

    if (!projectSelectionWarningSummary.hasSensitiveSessions) {
      void handleReorderGallery(folder.id, targetIndex);
      return;
    }

    openConfirm({
      title: 'Reorder project galleries?',
      message: `This project currently has ${projectSelectionWarningLabel}. Reordering "${folder.name}" can change the default gallery order, client navigation flow, and shared hero source while those proofing sessions are still in use.`,
      confirmText: 'Reorder anyway',
      onConfirm: async () => {
        await handleReorderGallery(folder.id, targetIndex);
      },
    });
  };

  const handleDeleteProject = async () => {
    try {
      await projectService.deleteProject(projectId);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(handleApiError(err).message || 'Failed to delete project');
    }
  };

  const requestDeleteProject = () => {
    const warningMessage = deleteProjectSelectionWarningSummary.hasSensitiveSessions
      ? ` This project currently has ${deleteProjectSelectionWarningLabel}. Deleting the whole project can invalidate active proofing sessions and remove photos clients already selected.`
      : '';

    openConfirm({
      title: 'Delete project?',
      message: `Are you sure you want to delete "${project?.name || 'this project'}" and all of its galleries? This action cannot be undone.${warningMessage}`,
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        await handleDeleteProject();
      },
    });
  };

  const handleCreateProjectShareLink = async (payload: {
    label?: string | null;
    is_active?: boolean;
    expires_at?: string | null;
  }) => {
    try {
      setIsCreatingShareLink(true);
      const created = await shareLinkService.createProjectShareLink(projectId, payload);
      await loadProject();
      return created;
    } finally {
      setIsCreatingShareLink(false);
    }
  };

  const handleUpdateProjectShareLink = async (payload: {
    label?: string | null;
    is_active?: boolean;
    expires_at?: string | null;
  }) => {
    if (!editingShareLink) return;
    await shareLinkService.updateProjectShareLink(projectId, editingShareLink.id, payload);
    setEditingShareLink(null);
    await loadProject();
  };

  const handleDeleteProjectShareLink = (shareLinkId: string) => {
    openConfirm({
      title: 'Delete share link',
      message: 'This will permanently remove the share link and its analytics data. Continue?',
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await shareLinkService.deleteProjectShareLink(projectId, shareLinkId);
          await loadProject();
        } catch (err) {
          setError(handleApiError(err).message || 'Failed to delete share link');
          throw err;
        }
      },
    });
  };

  const handleCreateGalleryShareLink = async (payload: {
    label?: string | null;
    is_active?: boolean;
    expires_at?: string | null;
  }) => {
    if (!sharingGallery) {
      throw new Error('Gallery not selected');
    }

    const created = await shareLinkService.createShareLink(sharingGallery.id, payload);
    await loadProject();
    return created;
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-surface p-6 text-sm text-muted">
        Loading project…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-danger/10 p-6 text-sm text-danger">
        {error || 'Project not found'}
      </div>
    );
  }

  const contentTabClassName = ({ selected }: { selected: boolean }): string =>
    `inline-flex h-12 shrink-0 items-center justify-center whitespace-nowrap rounded-2xl border px-5 text-sm font-semibold transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
      selected
        ? 'border-accent/60 bg-accent/12 text-accent shadow-[0_0_0_1px_rgba(56,189,248,0.08),0_12px_24px_-18px_rgba(56,189,248,0.9)]'
        : 'border-border/70 bg-surface/70 text-text hover:border-accent/35 hover:text-text'
    }`;

  const galleriesPanel = (
    <ProjectGalleriesPanel
      galleries={project.galleries}
      renameGalleryId={renameGalleryId}
      renameInput={renameInput}
      isRenamingGallery={isRenamingGallery}
      renameInputRef={renameInputRef}
      isUpdatingGallery={isUpdatingGallery}
      isReorderingGallery={isReorderingGallery}
      openGalleryDialog={openGalleryDialog}
      setRenameInput={setRenameInput}
      handleConfirmRename={() => void handleConfirmRename()}
      cancelInlineRename={cancelInlineRename}
      beginInlineRename={beginInlineRename}
      handleDeleteGallery={handleDeleteGallery}
      setSharingGallery={setSharingGallery}
      handleGalleryVisibilityChange={handleGalleryVisibilityChange}
      requestGalleryVisibilityChange={requestGalleryVisibilityChange}
      requestReorderGallery={requestReorderGallery}
    />
  );

  const appearancePanel = (
    <ProjectAppearanceSection
      project={project}
      photos={projectPhotos}
      isLoadingPhotos={isLoadingProjectPhotos}
      onLoadCoverPhotos={({ limit, offset }) =>
        projectService.getProjectPhotos(projectId, { limit, offset })
      }
      onSaveAppearance={async (payload) => {
        const updated = await projectService.updateProject(projectId, payload);
        setProject((prev) => (prev ? { ...prev, ...updated } : prev));
        return updated as ProjectDetail;
      }}
    />
  );

  const shareLinksPanel = (
    <ShareLinksSection
      shareLinks={shareLinks}
      isCreatingLink={isCreatingShareLink}
      onCreateLink={() => setIsShareLinkCreateOpen(true)}
      onDeleteLink={(linkId) => void handleDeleteProjectShareLink(linkId)}
      onEditLink={(link) => setEditingShareLink(link)}
      onOpenLinkAnalytics={(linkId) => navigate(`/share-links/${linkId}`)}
      onOpenDashboard={() => navigate('/share-links')}
    />
  );

  const contentTabItems = [
    {
      key: 'galleries' as const,
      tabClassName: contentTabClassName,
      tab: 'Galleries',
      panel: galleriesPanel,
    },
    {
      key: 'appearance' as const,
      tabClassName: contentTabClassName,
      tab: 'Appearance',
      panel: appearancePanel,
    },
  ];

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-4xl border border-border/50 bg-surface p-5 shadow-xs dark:border-border/30 dark:bg-surface-dark">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(31,144,255,0.12),transparent_34%),radial-gradient(circle_at_88%_10%,rgba(34,197,94,0.08),transparent_28%)]" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 max-w-5xl space-y-2">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-surface/80 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent/40 hover:text-accent dark:border-white/10 dark:bg-surface-dark/70"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Link>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-accent">
                Project delivery hub
              </p>
              <h1
                ref={projectTitleRef}
                style={{ fontSize: `${projectTitleFontSizePx}px` }}
                className="max-w-full whitespace-normal wrap-break-word font-sans font-bold uppercase leading-none tracking-wide text-text dark:text-accent-foreground"
              >
                {project.name}
              </h1>
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                <span>{formatDateOnly(project.shooting_date)}</span>
                <span aria-hidden="true">·</span>
                <span>{project.gallery_count} galleries</span>
                <span aria-hidden="true">·</span>
                <span>{visibleGalleryCount} visible</span>
                <span aria-hidden="true">·</span>
                <span>{project.total_photo_count} photos</span>
                <span aria-hidden="true">·</span>
                <span>{formatFileSize(project.total_size_bytes)}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {shareLinks.length} project share link{shareLinks.length === 1 ? '' : 's'}
                </span>
                {directOnlyGalleryCount > 0 ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{directOnlyGalleryCount} direct-only</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <button
              type="button"
              onClick={openProjectRenameDialog}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-3.5 py-2 text-sm font-semibold text-text transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
            >
              <PencilLine className="h-4 w-4" />
              Rename project
            </button>
            <button
              type="button"
              onClick={openGalleryDialog}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-3.5 py-2 text-sm font-semibold text-text transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
            >
              <FolderPlus className="h-4 w-4" />
              Add gallery
            </button>
            <button
              type="button"
              onClick={() => setIsShareLinkCreateOpen(true)}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:-translate-y-0.5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              <Share2 className="h-4 w-4" />
              Share project
            </button>
            <button
              type="button"
              onClick={requestDeleteProject}
              className="cursor-pointer rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2 text-sm font-semibold text-danger transition-all duration-200 hover:-translate-y-0.5 hover:bg-danger/15 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger"
            >
              Delete project
            </button>
          </div>
        </div>

        <div className="relative mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={FolderPlus}
            label="Galleries"
            value={project.gallery_count}
            helper={`${visibleGalleryCount} listed · ${directOnlyGalleryCount} direct-only`}
          />
          <MetricCard
            icon={ImageIcon}
            label="Photos"
            value={project.total_photo_count}
            helper="Across every gallery in this project"
          />
          <MetricCard
            icon={HardDrive}
            label="Storage"
            value={formatFileSize(project.total_size_bytes)}
            helper="Originals and generated thumbnails"
          />
          <MetricCard
            icon={Link2}
            label="Project links"
            value={shareLinks.length}
            helper="Project-scoped client delivery links"
          />
        </div>
        {error ? (
          <div className="relative mt-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {error}
          </div>
        ) : null}
        {projectSelectionWarningSummary.hasSensitiveSessions ? (
          <div className="relative mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-200">
            This project has {projectSelectionWarningLabel}. Gallery visibility, deletion, or order
            changes will ask for confirmation before changing the live proofing layout.
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border/50 bg-surface p-4 shadow-xs sm:p-5 dark:border-border/30 dark:bg-surface-dark">
        <AppTabs
          items={contentTabItems}
          selectedKey={activeTab}
          onChange={setActiveTab}
          preserveInactivePanels
          listClassName="flex flex-wrap items-center gap-2 overflow-x-auto border-b border-border/40 pb-3 dark:border-border/25"
          panelsClassName="mt-4"
        />
      </section>

      {shareLinksPanel}

      <AppDialog
        open={isProjectRenameDialogOpen}
        onClose={closeProjectRenameDialog}
        size="md"
        initialFocusRef={projectNameInputRef as React.RefObject<HTMLElement | null>}
        panelClassName="overflow-hidden rounded-[2rem] border border-border/50 bg-surface shadow-2xl dark:border-border/20 dark:bg-surface-dark"
      >
        <form onSubmit={handleRenameProjectSubmit}>
          <div className="bg-linear-to-br from-accent/12 via-surface to-surface px-6 py-5 dark:from-accent/15 dark:via-surface-dark dark:to-surface-dark">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <PencilLine className="h-6 w-6" />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
                  Project settings
                </p>
                <AppDialogTitle className="mt-1 font-sans text-2xl font-bold uppercase tracking-wide text-text">
                  Rename project
                </AppDialogTitle>
                <AppDialogDescription className="mt-1 text-sm leading-6 text-muted">
                  Update the internal project name shown on the dashboard and this delivery hub.
                </AppDialogDescription>
              </div>
            </div>
          </div>

          <div className="space-y-3 p-6">
            <label
              className="block text-xs font-bold uppercase tracking-[0.16em] text-muted"
              htmlFor="project-rename-name"
            >
              Project name
            </label>
            <input
              id="project-rename-name"
              ref={projectNameInputRef}
              type="text"
              value={projectNameDraft}
              onChange={(event) => setProjectNameDraft(event.target.value)}
              maxLength={GALLERY_NAME_MAX_LENGTH}
              className="h-12 w-full rounded-2xl border border-border/45 bg-surface-1 px-4 text-sm font-semibold text-text outline-none transition-colors placeholder:text-muted/70 hover:border-accent/45 focus:border-accent dark:border-border/30 dark:bg-surface-dark-1"
              placeholder="Project name"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>Use a name you can recognize later in the dashboard.</span>
              <span>
                {projectNameDraft.length}/{GALLERY_NAME_MAX_LENGTH}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-border/40 bg-surface-1/55 px-6 py-4 dark:border-border/30 dark:bg-surface-dark-1/55">
            <button
              type="button"
              onClick={closeProjectRenameDialog}
              disabled={isRenamingProject}
              className="rounded-xl border border-border/40 bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-all duration-200 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-surface-dark dark:hover:bg-surface-dark-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isRenamingProject ||
                !projectNameDraft.trim() ||
                projectNameDraft.trim() === project.name.trim() ||
                projectNameDraft.length > GALLERY_NAME_MAX_LENGTH
              }
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {isRenamingProject ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save name'
              )}
            </button>
          </div>
        </form>
      </AppDialog>

      <AppDialog
        open={isGalleryDialogOpen}
        onClose={closeGalleryDialog}
        size="md"
        initialFocusRef={galleryInputRef as React.RefObject<HTMLElement | null>}
        panelClassName="overflow-hidden rounded-[2rem] border border-border/50 bg-surface shadow-2xl dark:border-border/20 dark:bg-surface-dark"
      >
        <form onSubmit={handleCreateGallerySubmit}>
          <div className="bg-linear-to-br from-accent/12 via-surface to-surface px-6 py-5 dark:from-accent/15 dark:via-surface-dark dark:to-surface-dark">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <FolderPlus className="h-6 w-6" />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
                  Add gallery
                </p>
                <AppDialogTitle className="mt-1 font-sans text-2xl font-bold uppercase tracking-wide text-text">
                  Build the next chapter
                </AppDialogTitle>
                <AppDialogDescription className="mt-1 text-sm leading-6 text-muted">
                  Create a leaf gallery for uploads, client proofing, and optional direct delivery.
                </AppDialogDescription>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-6">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
              <div>
                <label
                  className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-muted"
                  htmlFor="project-folder-name"
                >
                  Gallery name
                </label>
                <input
                  id="project-folder-name"
                  ref={galleryInputRef}
                  type="text"
                  value={galleryDraft.name}
                  onChange={(event) =>
                    setGalleryDraft((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className="h-12 w-full rounded-2xl border border-border/45 bg-surface-1 px-4 text-sm font-semibold text-text outline-none transition-colors placeholder:text-muted/70 hover:border-accent/45 focus:border-accent dark:border-border/30 dark:bg-surface-dark-1"
                  placeholder="Wedding day, ceremony, reception…"
                />
              </div>
              <div>
                <label
                  className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-muted"
                  htmlFor="project-folder-date"
                >
                  Shooting date
                </label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    id="project-folder-date"
                    type="date"
                    value={galleryDraft.shooting_date}
                    onChange={(event) =>
                      setGalleryDraft((prev) => ({ ...prev, shooting_date: event.target.value }))
                    }
                    className="h-12 w-full rounded-2xl border border-border/45 bg-surface-1 pl-10 pr-3 text-sm font-semibold text-text outline-none transition-colors hover:border-accent/45 focus:border-accent dark:border-border/30 dark:bg-surface-dark-1"
                  />
                </div>
              </div>
            </div>

            <div>
              <label
                className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-muted"
                htmlFor="project-folder-visibility"
              >
                Visibility in project share
              </label>
              <select
                id="project-folder-visibility"
                value={galleryDraft.project_visibility}
                onChange={(event) =>
                  setGalleryDraft((prev) => ({
                    ...prev,
                    project_visibility: event.target.value as 'listed' | 'direct_only',
                  }))
                }
                className="h-12 w-full rounded-2xl border border-border/45 bg-surface-1 px-4 text-sm font-semibold text-text outline-none transition-colors hover:border-accent/45 focus:border-accent dark:border-border/30 dark:bg-surface-dark-1"
              >
                <option value="listed">Visible in project</option>
                <option value="direct_only">Direct link only</option>
              </select>
              <div className="mt-3 rounded-2xl border border-border/35 bg-surface-1/70 p-3 text-sm leading-6 text-muted dark:border-border/25 dark:bg-white/[0.035]">
                <span className="inline-flex items-center gap-2 font-semibold text-text">
                  <ListChecks className="h-4 w-4 text-accent" />
                  What this controls
                </span>
                <p className="mt-1">
                  Listed galleries appear in project links. Direct-link-only galleries stay hidden
                  there, but can still receive their own share link.
                </p>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-border/40 bg-surface-1/55 px-6 py-4 dark:border-border/30 dark:bg-surface-dark-1/55">
            <button
              type="button"
              onClick={closeGalleryDialog}
              className="rounded-xl border border-border/40 bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-all duration-200 hover:bg-surface-2 dark:bg-surface-dark dark:hover:bg-surface-dark-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreatingGallery || !galleryDraft.name.trim()}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {isCreatingGallery ? 'Creating…' : 'Create gallery'}
            </button>
          </div>
        </form>
      </AppDialog>

      <ShareLinkSettingsModal
        isOpen={isShareLinkCreateOpen}
        mode="create"
        galleryName={project.name}
        onClose={() => setIsShareLinkCreateOpen(false)}
        onCreate={handleCreateProjectShareLink}
        onSaveSelectionConfig={(shareLinkId, payload) =>
          shareLinkService.updateShareLinkSelectionConfig(shareLinkId, payload)
        }
        onManageCreated={(shareLinkId) => navigate(`/share-links/${shareLinkId}`)}
      />

      <ShareLinkEditorModal
        isOpen={Boolean(editingShareLink)}
        link={editingShareLink}
        onClose={() => setEditingShareLink(null)}
        onSave={handleUpdateProjectShareLink}
      />

      <ShareLinkSettingsModal
        isOpen={Boolean(sharingGallery)}
        mode="create"
        galleryName={sharingGallery?.name}
        onClose={() => setSharingGallery(null)}
        onCreate={handleCreateGalleryShareLink}
        onSaveSelectionConfig={(shareLinkId, payload) => {
          if (!sharingGallery) {
            throw new Error('Gallery not selected');
          }
          return shareLinkService.updateOwnerSelectionConfig(
            sharingGallery.id,
            shareLinkId,
            payload,
          );
        }}
        onManageCreated={(shareLinkId) => navigate(`/share-links/${shareLinkId}`)}
      />

      {ConfirmModal}
    </div>
  );
};
