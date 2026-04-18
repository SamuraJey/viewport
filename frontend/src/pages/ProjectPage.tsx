import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FolderPlus, Share2 } from 'lucide-react';
import { AppDialog, AppDialogDescription, AppDialogTitle } from '../components/ui';
import { ShareLinkEditorModal } from '../components/share-links/ShareLinkEditorModal';
import { ShareLinkSettingsModal } from '../components/share-links/ShareLinkSettingsModal';
import { handleApiError } from '../lib/errorHandling';
import { formatDateOnly, formatFileSize } from '../lib/utils';
import { galleryService } from '../services/galleryService';
import { projectService } from '../services/projectService';
import { shareLinkService } from '../services/shareLinkService';
import type { ProjectDetail, ProjectFolderSummary, ShareLink } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const emptyFolderDraft: {
  name: string;
  shooting_date: string;
  project_visibility: 'listed' | 'direct_only';
} = {
  name: '',
  shooting_date: new Date().toISOString().slice(0, 10),
  project_visibility: 'listed',
};

export const ProjectPage = () => {
  const { id } = useParams<{ id: string }>();
  const projectId = id!;
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [folderDraft, setFolderDraft] = useState(emptyFolderDraft);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isShareLinkCreateOpen, setIsShareLinkCreateOpen] = useState(false);
  const [editingShareLink, setEditingShareLink] = useState<ShareLink | null>(null);
  const [isUpdatingFolder, setIsUpdatingFolder] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      setError('');
      const [projectResponse, links] = await Promise.all([
        projectService.getProject(projectId),
        shareLinkService.getProjectShareLinks(projectId),
      ]);
      setProject(projectResponse);
      setShareLinks(links);
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

  const listedFolderCount = useMemo(
    () =>
      project?.folders.filter((folder) => (folder.project_visibility ?? 'listed') === 'listed')
        .length ?? 0,
    [project?.folders],
  );

  const handleCreateFolder = async () => {
    if (!folderDraft.name.trim()) {
      return;
    }
    setIsCreatingFolder(true);
    try {
      await projectService.createProjectFolder(projectId, {
        name: folderDraft.name.trim(),
        shooting_date: folderDraft.shooting_date,
        project_visibility: folderDraft.project_visibility,
      });
      setFolderDraft(emptyFolderDraft);
      setIsFolderDialogOpen(false);
      await loadProject();
    } catch (err) {
      setError(handleApiError(err).message || 'Failed to create folder');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleVisibilityChange = async (
    folder: ProjectFolderSummary,
    visibility: 'listed' | 'direct_only',
  ) => {
    setIsUpdatingFolder(folder.id);
    try {
      await galleryService.updateGallery(folder.id, { project_visibility: visibility });
      await loadProject();
    } catch (err) {
      setError(handleApiError(err).message || 'Failed to update folder visibility');
    } finally {
      setIsUpdatingFolder(null);
    }
  };

  const handleDeleteProject = async () => {
    try {
      await projectService.deleteProject(projectId);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(handleApiError(err).message || 'Failed to delete project');
    }
  };

  const handleCreateProjectShareLink = async (payload: {
    label?: string | null;
    is_active?: boolean;
    expires_at?: string | null;
  }) => {
    const created = await shareLinkService.createProjectShareLink(projectId, payload);
    await loadProject();
    return created;
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
          <div className="space-y-3">
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
              <h1 className="font-oswald text-4xl font-bold uppercase tracking-wide text-text">
                {project.name}
              </h1>
              <p className="mt-2 text-sm text-muted">
                {formatDateOnly(project.shooting_date)} · {project.folder_count} folders ·{' '}
                {listedFolderCount} visible in project share
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
              onClick={() => setIsFolderDialogOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-2.5 text-sm font-semibold text-text hover:border-accent/40"
            >
              <FolderPlus className="h-4 w-4" />
              Add folder
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
              onClick={() => void handleDeleteProject()}
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
      </section>

      <section className="rounded-3xl border border-border/50 bg-surface p-6 shadow-xs dark:border-border/30 dark:bg-surface-dark">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-text">Folders</h2>
            <p className="text-sm text-muted">
              Folders marked direct-only are hidden from project-wide public shares.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {project.folders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/40 bg-surface-1/50 px-4 py-10 text-center text-sm text-muted">
              No folders yet. Add the first folder to start uploading photos.
            </div>
          ) : (
            project.folders.map((folder) => (
              <div
                key={folder.id}
                className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-surface-1/50 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/galleries/${folder.id}`}
                      className="font-semibold text-text hover:text-accent"
                    >
                      {folder.name || `Folder #${folder.id.slice(0, 8)}`}
                    </Link>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        (folder.project_visibility ?? 'listed') === 'listed'
                          ? 'bg-accent/10 text-accent'
                          : 'bg-amber-500/10 text-amber-600'
                      }`}
                    >
                      {(folder.project_visibility ?? 'listed') === 'listed'
                        ? 'Visible in project'
                        : 'Direct link only'}
                    </span>
                    {folder.has_active_share_links ? (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                        Direct share active
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {folder.photo_count} photos · {formatFileSize(folder.total_size_bytes)} ·{' '}
                    {formatDateOnly(folder.shooting_date)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={folder.project_visibility ?? 'listed'}
                    disabled={isUpdatingFolder === folder.id}
                    onChange={(event) => {
                      void handleVisibilityChange(
                        folder,
                        event.target.value as 'listed' | 'direct_only',
                      );
                    }}
                    className="rounded-xl border border-border/40 bg-surface px-3 py-2 text-sm text-text"
                  >
                    <option value="listed">Visible in project</option>
                    <option value="direct_only">Direct link only</option>
                  </select>
                  <Link
                    to={`/galleries/${folder.id}`}
                    className="rounded-xl border border-border/40 bg-surface px-3 py-2 text-sm font-semibold text-text hover:border-accent/40"
                  >
                    Open folder
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-border/50 bg-surface p-6 shadow-xs dark:border-border/30 dark:bg-surface-dark">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-text">Project share links</h2>
          <p className="text-sm text-muted">
            These links expose only folders marked visible in project.
          </p>
        </div>
        <div className="space-y-3">
          {shareLinks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/40 bg-surface-1/50 px-4 py-8 text-sm text-muted">
              No project share links yet.
            </div>
          ) : (
            shareLinks.map((link) => (
              <div
                key={link.id}
                className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-surface-1/50 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <div className="font-semibold text-text">
                    {link.label || 'Untitled project link'}
                  </div>
                  <div className="text-sm text-muted">
                    {link.is_active === false
                      ? 'Inactive'
                      : link.expires_at
                        ? `Expires ${formatDateOnly(link.expires_at)}`
                        : 'No expiration'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingShareLink(link)}
                    className="rounded-xl border border-border/40 bg-surface px-3 py-2 text-sm font-semibold text-text hover:border-accent/40"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/share-links/${link.id}`)}
                    className="rounded-xl border border-border/40 bg-surface px-3 py-2 text-sm font-semibold text-text hover:border-accent/40"
                  >
                    Analytics
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteProjectShareLink(link.id)}
                    className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <AppDialog
        open={isFolderDialogOpen}
        onClose={() => {
          setIsFolderDialogOpen(false);
          setFolderDraft(emptyFolderDraft);
        }}
        size="sm"
        initialFocusRef={folderInputRef as React.RefObject<HTMLElement | null>}
        panelClassName="rounded-3xl border border-border/50 bg-surface p-6 shadow-2xl dark:border-border/20 dark:bg-surface-dark"
      >
        <AppDialogTitle className="text-lg font-semibold text-text">
          Add folder to project
        </AppDialogTitle>
        <AppDialogDescription className="mt-2 text-sm text-muted">
          This creates a folder using the existing gallery upload flow.
        </AppDialogDescription>
        <div className="mt-4 space-y-4">
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-text"
              htmlFor="project-folder-name"
            >
              Folder name
            </label>
            <input
              id="project-folder-name"
              ref={folderInputRef}
              value={folderDraft.name}
              onChange={(event) =>
                setFolderDraft((prev) => ({ ...prev, name: event.target.value }))
              }
              className="w-full rounded-xl border border-border/40 bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
              placeholder="Folder name"
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
              value={folderDraft.shooting_date}
              onChange={(event) =>
                setFolderDraft((prev) => ({ ...prev, shooting_date: event.target.value }))
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
              value={folderDraft.project_visibility}
              onChange={(event) =>
                setFolderDraft((prev) => ({
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
            onClick={() => setIsFolderDialogOpen(false)}
            className="rounded-xl border border-border/40 bg-surface px-4 py-2.5 text-sm font-semibold text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isCreatingFolder}
            onClick={() => void handleCreateFolder()}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"
          >
            {isCreatingFolder ? 'Creating…' : 'Create folder'}
          </button>
        </div>
      </AppDialog>

      <ShareLinkSettingsModal
        isOpen={isShareLinkCreateOpen}
        mode="create"
        galleryName={project.name}
        showSelectionSettings={false}
        onClose={() => setIsShareLinkCreateOpen(false)}
        onCreate={handleCreateProjectShareLink}
        onManageCreated={(shareLinkId) => navigate(`/share-links/${shareLinkId}`)}
      />

      <ShareLinkEditorModal
        isOpen={Boolean(editingShareLink)}
        link={editingShareLink}
        onClose={() => setEditingShareLink(null)}
        onSave={handleUpdateProjectShareLink}
      />
    </div>
  );
};
