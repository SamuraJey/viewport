import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, EyeOff, FolderPlus, Settings2, Share2 } from 'lucide-react';
import { EnhancedGalleryCard } from '../components/dashboard/EnhancedGalleryCard';
import { ShareLinksSection } from '../components/gallery/ShareLinksSection';
import { AppDialog, AppDialogDescription, AppDialogTitle, AppPopover } from '../components/ui';
import { ShareLinkEditorModal } from '../components/share-links/ShareLinkEditorModal';
import { ShareLinkSettingsModal } from '../components/share-links/ShareLinkSettingsModal';
import { useConfirmation } from '../hooks';
import { handleApiError } from '../lib/errorHandling';
import { formatDateOnly, formatFileSize } from '../lib/utils';
import { galleryService } from '../services/galleryService';
import { projectService } from '../services/projectService';
import { shareLinkService } from '../services/shareLinkService';
import type { Gallery, ProjectDetail, ProjectGallerySummary, ShareLink } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const emptyGalleryDraft: {
  name: string;
  shooting_date: string;
  project_visibility: 'listed' | 'direct_only';
} = {
  name: '',
  shooting_date: new Date().toISOString().slice(0, 10),
  project_visibility: 'listed',
};

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

const toProjectGalleryCard = (folder: ProjectGallerySummary): Gallery => ({
  id: folder.id,
  owner_id: folder.owner_id,
  project_id: folder.project_id,
  project_name: folder.project_name,
  project_position: folder.project_position,
  project_visibility: folder.project_visibility,
  name: folder.name,
  created_at: folder.created_at,
  shooting_date: folder.shooting_date,
  public_sort_by: 'original_filename',
  public_sort_order: 'asc',
  cover_photo_id: folder.cover_photo_id,
  photo_count: folder.photo_count,
  total_size_bytes: folder.total_size_bytes,
  has_active_share_links: folder.has_active_share_links,
  cover_photo_thumbnail_url: folder.cover_photo_thumbnail_url,
  recent_photo_thumbnail_urls: folder.recent_photo_thumbnail_urls,
});

const VISIBILITY_ACTION_BUTTON_CLASS =
  'flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-sm transition-all duration-200 hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

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
  const [galleryDraft, setGalleryDraft] = useState(emptyGalleryDraft);
  const [isCreatingGallery, setIsCreatingGallery] = useState(false);
  const [isCreatingShareLink, setIsCreatingShareLink] = useState(false);
  const [isShareLinkCreateOpen, setIsShareLinkCreateOpen] = useState(false);
  const [editingShareLink, setEditingShareLink] = useState<ShareLink | null>(null);
  const [isUpdatingGallery, setIsUpdatingGallery] = useState<string | null>(null);
  const [isReorderingGallery, setIsReorderingGallery] = useState<string | null>(null);
  const [sharingGallery, setSharingGallery] = useState<Gallery | null>(null);
  const [renameGalleryId, setRenameGalleryId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [isRenamingGallery, setIsRenamingGallery] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const projectTitleRef = useRef<HTMLHeadingElement | null>(null);
  const renameInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [projectTitleFontSizePx, setProjectTitleFontSizePx] = useState(48);

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
    } catch (err) {
      setError(handleApiError(err).message || 'Failed to load project');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  useDocumentTitle(project?.name ? `${project.name} · Project · Viewport` : 'Project · Viewport');

  useLayoutEffect(() => {
    const heading = projectTitleRef.current;
    if (!heading || !project?.name) {
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
      await projectService.createProjectFolder(projectId, {
        name: galleryDraft.name.trim(),
        shooting_date: galleryDraft.shooting_date,
        project_visibility: galleryDraft.project_visibility,
      });
      setGalleryDraft(emptyGalleryDraft);
      setIsGalleryDialogOpen(false);
      await loadProject();
    } catch (err) {
      setError(handleApiError(err).message || 'Failed to create gallery');
    } finally {
      setIsCreatingGallery(false);
    }
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

  const handleReorderGallery = async (folderId: string, targetIndex: number) => {
    if (!project) {
      return;
    }

    const currentIndex = project.galleries.findIndex((folder) => folder.id === folderId);
    if (currentIndex === -1) {
      return;
    }

    const boundedTargetIndex = Math.max(0, Math.min(targetIndex, project.galleries.length - 1));
    if (boundedTargetIndex === currentIndex) {
      return;
    }

    const reorderedGalleries = [...project.galleries];
    const [movedFolder] = reorderedGalleries.splice(currentIndex, 1);
    reorderedGalleries.splice(boundedTargetIndex, 0, movedFolder);

    const updates = reorderedGalleries
      .map((folder, index) => ({ folder, index }))
      .filter(({ folder, index }) => (folder.project_position ?? 0) !== index);

    if (updates.length === 0) {
      return;
    }

    setIsReorderingGallery(folderId);
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

  const handleDeleteProjectShareLink = async (shareLinkId: string) => {
    await shareLinkService.deleteProjectShareLink(projectId, shareLinkId);
    await loadProject();
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

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border/50 bg-surface p-6 shadow-xs dark:border-border/30 dark:bg-surface-dark">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-full space-y-3">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-accent"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                Project
              </p>
              <h1
                ref={projectTitleRef}
                style={{ fontSize: `${projectTitleFontSizePx}px` }}
                className="max-w-full whitespace-normal wrap-break-word font-oswald font-bold uppercase leading-tight tracking-wide text-text"
              >
                {project.name}
              </h1>
              <p className="mt-2 text-sm text-muted">
                {formatDateOnly(project.shooting_date)} · {project.gallery_count} galleries ·{' '}
                {visibleGalleryCount} visible in project share
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm text-muted">
              <span className="rounded-xl border border-border/40 bg-surface-1 px-3 py-2">
                {project.total_photo_count} photos
              </span>
              <span className="rounded-xl border border-border/40 bg-surface-1 px-3 py-2">
                {formatFileSize(project.total_size_bytes)}
              </span>
              <span className="rounded-xl border border-border/40 bg-surface-1 px-3 py-2">
                {shareLinks.length} project share link{shareLinks.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsGalleryDialogOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-2.5 text-sm font-semibold text-text hover:border-accent/40"
            >
              <FolderPlus className="h-4 w-4" />
              Add gallery
            </button>
            <button
              type="button"
              onClick={() => setIsShareLinkCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"
            >
              <Share2 className="h-4 w-4" />
              Share project
            </button>
            <button
              type="button"
              onClick={requestDeleteProject}
              className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm font-semibold text-danger"
            >
              Delete project
            </button>
          </div>
        </div>
        {error ? (
          <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}
        {projectSelectionWarningSummary.hasSensitiveSessions ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            This project has {projectSelectionWarningLabel}. Hiding, deleting, or reordering
            galleries will ask for confirmation before changing the live proofing layout.
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-border/50 bg-surface p-6 shadow-xs dark:border-border/30 dark:bg-surface-dark">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-text">Galleries</h2>
            <p className="text-sm text-muted">
              Project galleries use the same card layout as standalone galleries. Visibility lives
              inside each card, and direct-link-only galleries stay hidden from project-wide public
              shares.
            </p>
          </div>
        </div>
        <div className="space-y-4">
          {project.galleries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/40 bg-surface-1/50 px-4 py-10 text-center text-sm text-muted">
              No galleries yet. Add the first gallery to start uploading photos.
            </div>
          ) : (
            <div className="space-y-5">
              <motion.div
                className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                <AnimatePresence mode="popLayout">
                  {project.galleries.map((folder) => {
                    const galleryCard = toProjectGalleryCard(folder);
                    const currentIndex = project.galleries.findIndex(
                      (projectFolder) => projectFolder.id === folder.id,
                    );
                    const isFirstGallery = currentIndex === 0;
                    const isLastGallery = currentIndex === project.galleries.length - 1;

                    return (
                      <div key={folder.id}>
                        <EnhancedGalleryCard
                          gallery={galleryCard}
                          isRenamingThis={renameGalleryId === galleryCard.id}
                          renameInput={renameInput}
                          isRenaming={isRenamingGallery}
                          renameInputRef={renameInputRef}
                          onRenameInputChange={setRenameInput}
                          onConfirmRename={handleConfirmRename}
                          onCancelRename={cancelInlineRename}
                          onBeginRename={beginInlineRename}
                          onDelete={handleDeleteGallery}
                          onShare={(gallery) => setSharingGallery(gallery)}
                          extraTopBadges={
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium backdrop-blur-sm ${
                                (folder.project_visibility ?? 'listed') === 'listed'
                                  ? 'bg-accent/90 text-accent-foreground'
                                  : 'bg-amber-500/85 text-slate-950'
                              }`}
                            >
                              {(folder.project_visibility ?? 'listed') === 'listed' ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <EyeOff className="h-3 w-3" />
                              )}
                              {(folder.project_visibility ?? 'listed') === 'listed'
                                ? 'Visible in project'
                                : 'Direct link only'}
                            </span>
                          }
                          extraActions={
                            <AppPopover
                              key={`${folder.id}-${folder.project_visibility ?? 'listed'}`}
                              className="relative"
                              buttonClassName={VISIBILITY_ACTION_BUTTON_CLASS}
                              buttonAriaLabel={`Change project visibility for ${folder.name}`}
                              buttonContent={<Settings2 className="h-4 w-4" />}
                              panelClassName="w-56 rounded-2xl border border-border/40 bg-surface p-2 shadow-2xl dark:bg-surface-dark"
                              panel={
                                <div className="space-y-1">
                                  <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                                    Project visibility
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleGalleryVisibilityChange(folder, 'listed')
                                    }
                                    disabled={isUpdatingGallery === folder.id}
                                    className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                                      (folder.project_visibility ?? 'listed') === 'listed'
                                        ? 'bg-accent/10 text-accent'
                                        : 'text-text hover:bg-surface-1'
                                    }`}
                                  >
                                    <Check className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>
                                      <span className="block font-semibold">
                                        Visible in project
                                      </span>
                                      <span className="block text-xs text-muted">
                                        Shows in project-wide public links.
                                      </span>
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      requestGalleryVisibilityChange(folder, 'direct_only')
                                    }
                                    disabled={isUpdatingGallery === folder.id}
                                    className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                                      (folder.project_visibility ?? 'listed') === 'direct_only'
                                        ? 'bg-amber-500/10 text-amber-600'
                                        : 'text-text hover:bg-surface-1'
                                    }`}
                                  >
                                    <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>
                                      <span className="block font-semibold">Direct link only</span>
                                      <span className="block text-xs text-muted">
                                        Hidden from project shares, available by direct gallery
                                        link.
                                      </span>
                                    </span>
                                  </button>
                                  <div className="my-2 h-px bg-border/50" />
                                  <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                                    Project order
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => requestReorderGallery(folder, currentIndex - 1)}
                                    disabled={isFirstGallery || isReorderingGallery === folder.id}
                                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <span>
                                      <span className="block font-semibold">Move earlier</span>
                                      <span className="block text-xs text-muted">
                                        Shift this gallery toward the left/start.
                                      </span>
                                    </span>
                                    <span className="text-xs font-semibold text-muted">
                                      {isFirstGallery ? 'First' : '←'}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => requestReorderGallery(folder, currentIndex + 1)}
                                    disabled={isLastGallery || isReorderingGallery === folder.id}
                                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <span>
                                      <span className="block font-semibold">Move later</span>
                                      <span className="block text-xs text-muted">
                                        Shift this gallery toward the right/end.
                                      </span>
                                    </span>
                                    <span className="text-xs font-semibold text-muted">
                                      {isLastGallery ? 'Last' : '→'}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => requestReorderGallery(folder, 0)}
                                    disabled={isFirstGallery || isReorderingGallery === folder.id}
                                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <span>
                                      <span className="block font-semibold">Make leftmost</span>
                                      <span className="block text-xs text-muted">
                                        This gallery will drive the shared project hero.
                                      </span>
                                    </span>
                                  </button>
                                </div>
                              }
                            />
                          }
                          variants={cardVariants}
                        />
                        <div className="mt-2 px-1 text-xs text-muted">
                          Position {currentIndex + 1} of {project.galleries.length}
                        </div>
                      </div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
              <p className="text-sm text-muted">
                Direct-link-only galleries stay hidden from project-wide public shares, but they
                keep their own direct share links.
              </p>
            </div>
          )}
        </div>
      </section>

      <ShareLinksSection
        shareLinks={shareLinks}
        isCreatingLink={isCreatingShareLink}
        onCreateLink={() => setIsShareLinkCreateOpen(true)}
        onDeleteLink={(linkId) => void handleDeleteProjectShareLink(linkId)}
        onEditLink={(link) => setEditingShareLink(link)}
        onOpenLinkAnalytics={(linkId) => navigate(`/share-links/${linkId}`)}
        onOpenDashboard={() => navigate('/share-links')}
      />

      <AppDialog
        open={isGalleryDialogOpen}
        onClose={() => {
          setIsGalleryDialogOpen(false);
          setGalleryDraft(emptyGalleryDraft);
        }}
        size="sm"
        initialFocusRef={galleryInputRef as React.RefObject<HTMLElement | null>}
        panelClassName="rounded-3xl border border-border/50 bg-surface p-6 shadow-2xl dark:border-border/20 dark:bg-surface-dark"
      >
        <AppDialogTitle className="text-lg font-semibold text-text">
          Add gallery to project
        </AppDialogTitle>
        <AppDialogDescription className="mt-2 text-sm text-muted">
          This creates a gallery using the existing gallery upload flow.
        </AppDialogDescription>
        <div className="mt-4 space-y-4">
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-text"
              htmlFor="project-folder-name"
            >
              Gallery name
            </label>
            <input
              id="project-folder-name"
              ref={galleryInputRef}
              value={galleryDraft.name}
              onChange={(event) =>
                setGalleryDraft((prev) => ({ ...prev, name: event.target.value }))
              }
              className="w-full rounded-xl border border-border/40 bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
              placeholder="Gallery name"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-text"
              htmlFor="project-folder-date"
            >
              Shooting date
            </label>
            <input
              id="project-folder-date"
              type="date"
              value={galleryDraft.shooting_date}
              onChange={(event) =>
                setGalleryDraft((prev) => ({ ...prev, shooting_date: event.target.value }))
              }
              className="w-full rounded-xl border border-border/40 bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-text"
              htmlFor="project-folder-visibility"
            >
              Visibility in project link
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
              className="w-full rounded-xl border border-border/40 bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
            >
              <option value="listed">Visible in project</option>
              <option value="direct_only">Direct link only</option>
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsGalleryDialogOpen(false)}
            className="rounded-xl border border-border/40 bg-surface px-4 py-2.5 text-sm font-semibold text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isCreatingGallery}
            onClick={() => void handleCreateGallery()}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"
          >
            {isCreatingGallery ? 'Creating…' : 'Create gallery'}
          </button>
        </div>
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
