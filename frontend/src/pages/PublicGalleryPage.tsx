import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Download as DownloadIcon,
  Heart,
  Link2,
  LogOut,
} from 'lucide-react';
import { SkipToContentLink } from '../components/a11y/SkipToContentLink';
import { ReadabilitySettingsButton } from '../components/ReadabilitySettingsButton';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { AppDialog, AppDialogDescription, AppDialogTitle } from '../components/ui';
import { PublicGalleryHero } from '../components/public-gallery/PublicGalleryHero';
import { PublicGalleryPhotoSection } from '../components/public-gallery/PublicGalleryPhotoSection';
import {
  PublicGalleryError,
  PublicGalleryExpired,
} from '../components/public-gallery/PublicGalleryStates';
import { usePhotoLightbox } from '../hooks/usePhotoLightbox';
import { usePublicGallery, usePublicSelection } from '../hooks';
import { usePublicGalleryGrid } from '../hooks/usePublicGalleryGrid';
import { copyTextToClipboard } from '../lib/clipboard';
import { isDemoModeEnabled } from '../lib/demoMode';
import { handleApiError } from '../lib/errorHandling';
import { getAccessiblePhotoName } from '../lib/accessibility';
import { getDemoService } from '../services/demoService';
import { shareLinkService } from '../services/shareLinkService';
import type { PublicPhoto, SelectionSessionStartRequest, SharedProjectShare } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const createInitialStartForm = (): SelectionSessionStartRequest => ({
  client_name: '',
  client_email: '',
  client_phone: '',
  client_note: '',
});

export const PublicGalleryPage = () => {
  const { shareId, resumeToken, folderId, galleryId } = useParams<{
    shareId: string;
    resumeToken?: string;
    folderId?: string;
    galleryId?: string;
  }>();
  const navigate = useNavigate();
  const isFavoritesView = Boolean(resumeToken);
  const activeGalleryId = galleryId ?? folderId;

  const [startForm, setStartForm] = useState<SelectionSessionStartRequest>(createInitialStartForm);
  const [startFormError, setStartFormError] = useState('');
  const [sessionNoteDraft, setSessionNoteDraft] = useState('');
  const [showSelectionSection, setShowSelectionSection] = useState(false);
  const [openFavoritesAfterStart, setOpenFavoritesAfterStart] = useState(false);
  const [entryLinkCopied, setEntryLinkCopied] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<PublicPhoto[]>([]);
  const [selectedPhotosError, setSelectedPhotosError] = useState('');
  const [isLoadingSelectedPhotos, setIsLoadingSelectedPhotos] = useState(false);
  const [projectNavigation, setProjectNavigation] = useState<SharedProjectShare | null>(null);
  const [projectNavigationShareId, setProjectNavigationShareId] = useState<string | null>(null);
  const startNameInputRef = useRef<HTMLInputElement | null>(null);

  const { gallery, photos, isLoading, isLoadingMore, hasMore, error, errorStatus, loadMorePhotos } =
    usePublicGallery({ shareId, galleryId: activeGalleryId });

  const selection = usePublicSelection({
    shareId,
    initialResumeToken: resumeToken,
  });
  const isSelectionEnabled = selection.config?.is_enabled ?? false;
  const openSelectionStartModal = selection.openStartModal;

  const favoritesPath = useMemo(() => {
    if (!shareId || !selection.session?.resume_token) {
      return null;
    }
    return `/share/${shareId}/favorites/${selection.session.resume_token}`;
  }, [selection.session?.resume_token, shareId]);

  const entryLink = useMemo(() => {
    if (!favoritesPath || typeof window === 'undefined') {
      return '';
    }
    return `${window.location.origin}${favoritesPath}`;
  }, [favoritesPath]);

  useEffect(() => {
    if (!openFavoritesAfterStart || !favoritesPath) {
      return;
    }

    navigate(favoritesPath);
    setOpenFavoritesAfterStart(false);
  }, [favoritesPath, navigate, openFavoritesAfterStart]);

  useEffect(() => {
    setSessionNoteDraft(selection.session?.client_note ?? '');
  }, [selection.session?.client_note]);

  useEffect(() => {
    if (selection.showStartModal || selection.session) {
      setShowSelectionSection(true);
      return;
    }

    if (selection.config?.is_enabled) {
      const timeoutId = window.setTimeout(() => {
        setShowSelectionSection(false);
      }, 0);
      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    setShowSelectionSection(false);
  }, [selection.config?.is_enabled, selection.session, selection.showStartModal]);

  useEffect(() => {
    if (!shareId || !isFavoritesView) {
      return;
    }

    if (selection.isLoadingConfig || selection.isLoadingSession) {
      return;
    }

    if (selection.config?.is_enabled && !selection.session) {
      navigate(`/share/${shareId}`, { replace: true });
    }
  }, [
    isFavoritesView,
    navigate,
    selection.config?.is_enabled,
    selection.isLoadingConfig,
    selection.isLoadingSession,
    selection.session,
    shareId,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadSelectedPhotos = async () => {
      if (!shareId || !selection.session) {
        setSelectedPhotos([]);
        setSelectedPhotosError('');
        return;
      }

      const orderedPhotoIds = selection.session.items.map((item) => item.photo_id);
      if (orderedPhotoIds.length === 0) {
        setSelectedPhotos([]);
        setSelectedPhotosError('');
        return;
      }

      const loadedPhotoMap = new Map(photos.map((photo) => [photo.photo_id, photo]));
      const missingPhotoIds = orderedPhotoIds.filter((photoId) => !loadedPhotoMap.has(photoId));

      if (missingPhotoIds.length === 0) {
        setSelectedPhotos(
          orderedPhotoIds
            .map((photoId) => loadedPhotoMap.get(photoId))
            .filter((photo): photo is PublicPhoto => Boolean(photo)),
        );
        setSelectedPhotosError('');
        return;
      }

      setIsLoadingSelectedPhotos(true);
      setSelectedPhotosError('');
      try {
        const fetchedPhotos = await shareLinkService.getPublicPhotosByIds(shareId, missingPhotoIds);
        if (cancelled) {
          return;
        }

        const mergedPhotoMap = new Map(loadedPhotoMap);
        fetchedPhotos.forEach((photo) => {
          mergedPhotoMap.set(photo.photo_id, photo);
        });

        setSelectedPhotos(
          orderedPhotoIds
            .map((photoId) => mergedPhotoMap.get(photoId))
            .filter((photo): photo is PublicPhoto => Boolean(photo)),
        );
      } catch (err) {
        if (cancelled) {
          return;
        }

        setSelectedPhotosError(handleApiError(err).message || 'Failed to load selected photos');
        setSelectedPhotos(
          orderedPhotoIds
            .map((photoId) => loadedPhotoMap.get(photoId))
            .filter((photo): photo is PublicPhoto => Boolean(photo)),
        );
      } finally {
        if (!cancelled) {
          setIsLoadingSelectedPhotos(false);
        }
      }
    };

    void loadSelectedPhotos();
    return () => {
      cancelled = true;
    };
  }, [photos, selection.session, shareId]);

  const displayedPhotos = useMemo(
    () => (isFavoritesView ? selectedPhotos : photos),
    [isFavoritesView, photos, selectedPhotos],
  );

  const observerTargetRef = useRef<HTMLDivElement | null>(null);
  const loadMorePhotosRef = useRef<(() => void) | undefined>(undefined);

  const {
    gridDensity,
    gridLayout,
    gridRef,
    gridClassNames,
    setGridMode,
    setLayoutMode,
    touchHandlers,
  } = usePublicGalleryGrid({ photos: displayedPhotos });

  const { openLightbox, renderLightbox } = usePhotoLightbox({
    photoCardSelector: '.pg-card',
    gridRef,
    onLoadMore: () => {
      if (!isFavoritesView) {
        loadMorePhotosRef.current?.();
      }
    },
    hasMore: isFavoritesView ? false : hasMore,
    isLoadingMore: isFavoritesView ? false : isLoadingMore,
    loadMoreThreshold: 10,
  });

  useEffect(() => {
    loadMorePhotosRef.current = loadMorePhotos;
  }, [loadMorePhotos]);

  useEffect(() => {
    if (isFavoritesView) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMorePhotos();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '400px',
      },
    );

    if (observerTargetRef.current) {
      observer.observe(observerTargetRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isFavoritesView, isLoadingMore, loadMorePhotos]);

  const handleDownloadAll = useCallback(() => {
    if (!shareId) return;
    if (isDemoModeEnabled()) {
      getDemoService().downloadSharedGalleryZip(shareId);
      return;
    }

    window.open(`${API_BASE_URL}/s/${shareId}/download/all`, '_blank');
  }, [shareId]);

  const handleOpenFavorites = useCallback(() => {
    if (!shareId || !isSelectionEnabled) {
      return;
    }

    if (!favoritesPath) {
      setOpenFavoritesAfterStart(true);
      openSelectionStartModal();
      return;
    }

    navigate(favoritesPath);
  }, [favoritesPath, isSelectionEnabled, navigate, openSelectionStartModal, shareId]);

  const handleBackToGallery = useCallback(() => {
    if (!shareId) {
      return;
    }
    navigate(`/share/${shareId}`);
  }, [navigate, shareId]);

  const projectShare = gallery?.scope_type === 'project' ? gallery : null;
  const folderShare = gallery?.scope_type === 'project' ? null : gallery;
  const isProjectShare = projectShare !== null;
  const projectGalleryTabs = projectNavigation ?? projectShare;
  const isProjectFolderView = Boolean(folderShare?.parent_share_id && !isFavoritesView);
  const showStickyProjectSelectionBar = Boolean(
    projectGalleryTabs && selection.config?.is_enabled && !isFavoritesView,
  );
  const heroTitle = isProjectFolderView
    ? folderShare?.project_name || projectGalleryTabs?.project_name || 'Public Project'
    : folderShare?.gallery_name || 'Public Gallery';
  const heroDate = isProjectFolderView ? projectGalleryTabs?.date : folderShare?.date;
  const heroPhotographer = isProjectFolderView
    ? projectGalleryTabs?.photographer || folderShare?.photographer
    : folderShare?.photographer;
  const heroCover = isProjectFolderView ? (projectGalleryTabs?.cover ?? null) : folderShare?.cover;

  useEffect(() => {
    if (!shareId || isFavoritesView) {
      setProjectNavigation(null);
      setProjectNavigationShareId(null);
      return;
    }

    if (projectShare) {
      setProjectNavigation(projectShare);
      setProjectNavigationShareId(shareId);
      return;
    }

    if (!activeGalleryId || (projectNavigation && projectNavigationShareId === shareId)) {
      return;
    }

    let cancelled = false;

    const loadProjectNavigation = async () => {
      try {
        const response = await shareLinkService.getSharedGallery(shareId, {
          navigationOnly: true,
        });
        if (cancelled) {
          return;
        }
        if (response.scope_type === 'project') {
          setProjectNavigation(response);
          setProjectNavigationShareId(shareId);
          return;
        }
        setProjectNavigation(null);
        setProjectNavigationShareId(null);
      } catch {
        if (!cancelled) {
          setProjectNavigation(null);
          setProjectNavigationShareId(null);
        }
      }
    };

    void loadProjectNavigation();

    return () => {
      cancelled = true;
    };
  }, [
    activeGalleryId,
    isFavoritesView,
    projectNavigation,
    projectNavigationShareId,
    projectShare,
    shareId,
  ]);

  useEffect(() => {
    if (isFavoritesView || activeGalleryId || !projectShare?.folders.length) {
      return;
    }

    navigate(projectShare.folders[0].route_path, { replace: true });
  }, [activeGalleryId, isFavoritesView, navigate, projectShare]);

  const handleLogoutSelection = useCallback(() => {
    if (!shareId) {
      return;
    }

    selection.clearSession();
    setSessionNoteDraft('');
    navigate(`/share/${shareId}`);
  }, [navigate, selection, shareId]);

  const handleCopyEntryLink = useCallback(async () => {
    if (!entryLink) {
      return;
    }

    const copied = await copyTextToClipboard(entryLink);
    if (!copied) {
      return;
    }

    setEntryLinkCopied(true);
    window.setTimeout(() => {
      setEntryLinkCopied(false);
    }, 2000);
  }, [entryLink]);

  const handleOpenSelectionStart = useCallback(
    (openFavoritesAfter = false) => {
      setOpenFavoritesAfterStart(openFavoritesAfter);
      selection.openStartModal();
    },
    [selection],
  );

  const handleStickyFinishSelection = useCallback(() => {
    if (!isSelectionEnabled) {
      return;
    }

    if (!selection.session) {
      handleOpenSelectionStart(false);
      return;
    }

    if (!selection.canMutateSession || selection.isMutating) {
      return;
    }

    void selection.submitSelection();
  }, [handleOpenSelectionStart, isSelectionEnabled, selection]);

  const lightboxSlides = useMemo(
    () =>
      displayedPhotos.map((photo) => ({
        src: photo.full_url,
        thumbnailSrc: photo.thumbnail_url,
        width: photo.width || undefined,
        height: photo.height || undefined,
        alt: getAccessiblePhotoName({
          displayName: photo.filename,
          filename: photo.filename,
        }),
        download: photo.full_url,
        downloadFilename: photo.filename || `photo-${photo.photo_id}.jpg`,
      })),
    [displayedPhotos],
  );

  const combinedSelectionError = selectedPhotosError || selection.error;
  useDocumentTitle(
    isFavoritesView
      ? `${folderShare?.gallery_name || 'Favorites'} · Viewport`
      : isProjectShare || isProjectFolderView
        ? `${projectGalleryTabs?.project_name || folderShare?.project_name || 'Public Project'} · Viewport`
        : `${folderShare?.gallery_name || 'Public Gallery'} · Viewport`,
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface text-text dark:bg-surface-foreground/5">
        <SkipToContentLink targetId="main-content" />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-h-screen items-center justify-center px-4"
        >
          <div
            role="status"
            aria-live="polite"
            aria-label="Loading gallery"
            className="rounded-2xl border border-border/50 bg-surface-1/70 px-5 py-4 text-sm font-medium text-muted shadow-xs"
          >
            Loading gallery...
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    if (errorStatus === 410) {
      return <PublicGalleryExpired />;
    }
    return <PublicGalleryError error={error} />;
  }

  if (isProjectShare && !activeGalleryId && !isFavoritesView) {
    if (projectShare.folders.length === 0) {
      return (
        <div className="min-h-screen bg-surface text-text dark:bg-surface-foreground/5">
          <SkipToContentLink targetId="main-content" />
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto flex min-h-screen max-w-4xl items-center px-4 py-16 sm:px-6 lg:px-10"
          >
            <div className="w-full rounded-3xl border border-border/50 bg-surface p-8 shadow-xs">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                Project share
              </p>
              <h1 className="mt-3 font-oswald text-4xl font-bold uppercase tracking-wide text-text">
                {projectShare.project_name || 'Public Project'}
              </h1>
              <p className="mt-3 text-sm text-muted">
                No visible galleries are available in this project.
              </p>
            </div>
          </main>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-surface text-text dark:bg-surface-foreground/5">
        <SkipToContentLink targetId="main-content" />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto flex min-h-screen max-w-4xl items-center px-4 py-16 sm:px-6 lg:px-10"
        >
          <div
            role="status"
            aria-live="polite"
            aria-label="Opening project gallery"
            className="rounded-2xl border border-border/50 bg-surface-1/70 px-5 py-4 text-sm font-medium text-muted shadow-xs"
          >
            Opening the first gallery…
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-text dark:bg-surface-foreground/5">
      <SkipToContentLink targetId="main-content" />
      <div className="fixed top-6 right-6 z-30 flex items-center gap-2">
        <ReadabilitySettingsButton />
        <ThemeSwitch variant="inline" />
      </div>

      <PublicGalleryHero
        title={heroTitle}
        date={heroDate}
        photographer={heroPhotographer}
        cover={heroCover}
      />

      <main
        id="main-content"
        tabIndex={-1}
        className={`w-full px-4 py-16 sm:px-6 lg:px-10 ${showStickyProjectSelectionBar ? 'pb-36 sm:pb-40' : ''}`}
      >
        {projectGalleryTabs ? (
          <section className="mb-6 rounded-2xl border border-border/50 bg-surface-1/70 p-4 shadow-xs">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                  Project
                </p>
                <h2 className="mt-1 text-lg font-semibold text-text">
                  {projectGalleryTabs.project_name || 'Public Project'}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {projectGalleryTabs.photographer || 'Photographer'} ·{' '}
                  {projectGalleryTabs.total_listed_folders || 0} galleries ·{' '}
                  {projectGalleryTabs.total_listed_photos || 0} photos
                </p>
              </div>
              {!isFavoritesView ? (
                <button
                  onClick={handleDownloadAll}
                  className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface px-4 py-2.5 text-sm font-semibold text-text hover:border-accent/40"
                >
                  <DownloadIcon className="h-4 w-4" />
                  Download Project
                </button>
              ) : null}
            </div>

            <div className="mt-4 overflow-x-auto pb-1">
              <div className="flex min-w-max gap-2">
                {projectGalleryTabs.folders.map((projectGallery, index) => {
                  const isActive =
                    projectGallery.folder_id === activeGalleryId ||
                    (!activeGalleryId && index === 0);
                  return (
                    <Link
                      key={projectGallery.folder_id}
                      to={projectGallery.route_path}
                      className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                        isActive
                          ? 'border-accent/50 bg-accent/10 text-accent'
                          : 'border-border/40 bg-surface text-text hover:border-accent/30'
                      }`}
                    >
                      {projectGallery.folder_name}
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-surface-1/70 px-4 py-3 shadow-xs">
          <div className="flex flex-wrap items-center gap-2">
            {isFavoritesView ? (
              <button
                type="button"
                onClick={handleBackToGallery}
                className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface px-3 py-2 text-sm font-semibold text-text hover:border-accent/40"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to gallery
              </button>
            ) : (
              <p className="text-sm text-muted">
                {selection.config?.is_enabled
                  ? `${selection.config.list_title || 'Favorites'} enabled`
                  : 'Browse and download the gallery'}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {!isFavoritesView && photos.length > 0 && !projectGalleryTabs ? (
              <button
                onClick={handleDownloadAll}
                className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface px-4 py-2.5 text-sm font-semibold text-text hover:border-accent/40"
              >
                <DownloadIcon className="h-4 w-4" />
                Download All Photos
              </button>
            ) : null}

            {selection.config?.is_enabled ? (
              <button
                type="button"
                onClick={handleOpenFavorites}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                  isFavoritesView
                    ? 'bg-accent text-accent-foreground'
                    : 'border border-accent/30 bg-accent/10 text-accent hover:bg-accent/15'
                }`}
              >
                <Heart className="h-4 w-4" />
                {selection.session?.selected_count ?? 0}
              </button>
            ) : null}

            {selection.session ? (
              <button
                type="button"
                onClick={() => {
                  void handleCopyEntryLink();
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface px-4 py-2.5 text-sm font-semibold text-text hover:border-accent/40"
              >
                <Link2 className="h-4 w-4" />
                {entryLinkCopied ? 'Link copied' : 'Entry link'}
              </button>
            ) : null}

            {selection.session ? (
              <button
                type="button"
                onClick={handleLogoutSelection}
                className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface px-4 py-2.5 text-sm font-semibold text-text hover:border-danger/40 hover:text-danger"
              >
                <LogOut className="h-4 w-4" />
                Exit
              </button>
            ) : null}
          </div>
        </div>

        {selection.config?.is_enabled && !isFavoritesView ? (
          <div className="mb-8 rounded-3xl border border-border/50 bg-surface-1/70 p-6 shadow-xs">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                  Favorites
                </p>
                <h2 className="text-2xl font-semibold text-text">
                  {selection.config.list_title || 'Selected photos'}
                </h2>
                <p className="max-w-2xl text-sm text-muted">
                  {selection.session
                    ? `You already have a saved selection with ${selection.session.selected_count} chosen photo${selection.session.selected_count === 1 ? '' : 's'}.`
                    : 'Use the heart button on a photo to start building a shortlist for the photographer.'}
                </p>
                {selection.config.limit_enabled && selection.config.limit_value ? (
                  <p className="text-sm text-muted">
                    Limit: {selection.config.limit_value} photo
                    {selection.config.limit_value === 1 ? '' : 's'}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selection.session ? (
                  <>
                    <button
                      type="button"
                      onClick={handleOpenFavorites}
                      className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"
                    >
                      Open favorites
                    </button>
                    <button
                      type="button"
                      onClick={selection.startNewSession}
                      className="rounded-xl border border-border/50 bg-surface px-4 py-2.5 text-sm font-semibold text-text hover:border-accent/40"
                    >
                      Start new session
                    </button>
                  </>
                ) : showSelectionSection ? (
                  <button
                    type="button"
                    onClick={() => handleOpenSelectionStart(false)}
                    className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"
                  >
                    Start selection
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSelectionSection(true)}
                    className="rounded-xl border border-border/50 bg-surface px-4 py-2.5 text-sm font-semibold text-text hover:border-accent/40"
                  >
                    Open selection panel
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {isFavoritesView ? (
          <div className="mb-8 rounded-3xl border border-border/50 bg-surface-1/70 p-6 text-center shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
              Favorites list
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-text">
              {selection.config?.list_title || 'Selected photos'}
            </h2>
            <p className="mt-3 text-sm text-muted">
              {selection.session?.client_name || 'Anonymous guest'}
              {selection.session?.status ? ` • ${selection.session.status}` : ''}
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm text-muted">
              <button
                type="button"
                onClick={handleBackToGallery}
                className="inline-flex items-center gap-2 hover:text-accent"
              >
                <ArrowLeft className="h-4 w-4" />
                Go to gallery
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleCopyEntryLink();
                }}
                className="inline-flex items-center gap-2 hover:text-accent"
              >
                <Link2 className="h-4 w-4" />
                {entryLinkCopied ? 'Link copied' : 'Entry link'}
              </button>
            </div>

            {selection.session ? (
              <div className="mx-auto mt-6 max-w-xl space-y-4">
                <textarea
                  value={sessionNoteDraft}
                  onChange={(event) => setSessionNoteDraft(event.target.value)}
                  onBlur={(event) => {
                    if (!selection.canMutateSession) return;
                    void selection.updateClientNote(event.currentTarget.value);
                  }}
                  disabled={!selection.canMutateSession}
                  className="min-h-28 w-full rounded-2xl border border-border/50 bg-surface px-4 py-3 text-sm text-text outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-70"
                  placeholder="General note for selected photos"
                />

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      void selection.submitSelection();
                    }}
                    disabled={!selection.canMutateSession || selection.isMutating}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Finish selection
                  </button>
                  <button
                    type="button"
                    onClick={handleLogoutSelection}
                    className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface px-5 py-3 text-sm font-semibold text-text hover:border-danger/40 hover:text-danger"
                  >
                    <LogOut className="h-4 w-4" />
                    Exit guest
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <PublicGalleryPhotoSection
          photos={displayedPhotos}
          totalPhotos={
            isFavoritesView
              ? (selection.session?.selected_count ?? selectedPhotos.length)
              : (folderShare?.total_photos ?? photos.length)
          }
          displayedPhotos={displayedPhotos.length}
          sectionTitle={isFavoritesView ? 'Selected Photos' : 'Photos'}
          emptyTitle={isFavoritesView ? 'No photos selected yet' : 'No photos in this gallery'}
          emptyDescription={
            isFavoritesView
              ? 'Use the heart button on gallery photos to add them to this shortlist.'
              : 'This gallery appears to be empty. Check back later for updates.'
          }
          gridClassNames={gridClassNames}
          gridLayout={gridLayout}
          gridDensity={gridDensity}
          gridRef={gridRef}
          observerTargetRef={observerTargetRef}
          isLoadingMore={!isFavoritesView && isLoadingMore}
          hasMore={!isFavoritesView && hasMore}
          onLayoutChange={setLayoutMode}
          onDensityChange={setGridMode}
          onOpenPhoto={openLightbox}
          touchHandlers={touchHandlers}
          selection={
            selection.config?.is_enabled
              ? {
                  enabled: true,
                  selectedIds: selection.selectedIds,
                  selectedCount: selection.session?.selected_count ?? 0,
                  canMutate: selection.canMutateSession,
                  allowPhotoComments: selection.config.allow_photo_comments,
                  session: selection.session,
                  commentsByPhotoId: selection.commentsByPhotoId,
                  onTogglePhoto: (photoId: string) => {
                    void selection.togglePhoto(photoId);
                  },
                  onUpdatePhotoComment: (photoId: string, comment: string) => {
                    void selection.updatePhotoComment(photoId, comment);
                  },
                }
              : undefined
          }
        />

        {isFavoritesView && isLoadingSelectedPhotos ? (
          <div className="mt-4 text-center text-sm text-muted">Loading selected photos...</div>
        ) : null}

        {combinedSelectionError ? (
          <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {combinedSelectionError}
          </div>
        ) : null}

        {selection.showStartModal ? (
          <AppDialog
            open={selection.showStartModal}
            onClose={() => {
              selection.closeStartModal();
              setOpenFavoritesAfterStart(false);
            }}
            size="sm"
            initialFocusRef={startNameInputRef}
            panelClassName="rounded-3xl border border-border/50 bg-surface p-5 shadow-xl dark:border-border/20 dark:bg-surface-dark"
          >
            <div>
              <AppDialogTitle className="text-lg font-semibold text-text">
                Start selection
              </AppDialogTitle>
              <AppDialogDescription className="mt-2 text-sm text-muted">
                Enter your details to begin selecting photos.
              </AppDialogDescription>
              <div className="mt-4 space-y-3">
                <div>
                  <label
                    htmlFor="selection-client-name"
                    className="mb-1.5 block text-sm font-medium text-text"
                  >
                    Your name
                  </label>
                  <input
                    id="selection-client-name"
                    ref={startNameInputRef}
                    value={startForm.client_name}
                    onChange={(event) =>
                      setStartForm((prev) => ({ ...prev, client_name: event.target.value }))
                    }
                    placeholder="Your name"
                    aria-invalid={startFormError ? 'true' : undefined}
                    aria-describedby={startFormError ? 'selection-start-error' : undefined}
                    className="w-full rounded-xl border border-border/50 bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent dark:bg-surface-dark-1"
                  />
                </div>
                {selection.config?.require_email ? (
                  <div>
                    <label
                      htmlFor="selection-client-email"
                      className="mb-1.5 block text-sm font-medium text-text"
                    >
                      Email
                    </label>
                    <input
                      id="selection-client-email"
                      type="email"
                      value={startForm.client_email ?? ''}
                      onChange={(event) =>
                        setStartForm((prev) => ({ ...prev, client_email: event.target.value }))
                      }
                      placeholder="Email"
                      aria-invalid={startFormError ? 'true' : undefined}
                      aria-describedby={startFormError ? 'selection-start-error' : undefined}
                      className="w-full rounded-xl border border-border/50 bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent dark:bg-surface-dark-1"
                    />
                  </div>
                ) : null}
                {selection.config?.require_phone ? (
                  <div>
                    <label
                      htmlFor="selection-client-phone"
                      className="mb-1.5 block text-sm font-medium text-text"
                    >
                      Phone
                    </label>
                    <input
                      id="selection-client-phone"
                      value={startForm.client_phone ?? ''}
                      onChange={(event) =>
                        setStartForm((prev) => ({ ...prev, client_phone: event.target.value }))
                      }
                      placeholder="Phone"
                      aria-invalid={startFormError ? 'true' : undefined}
                      aria-describedby={startFormError ? 'selection-start-error' : undefined}
                      className="w-full rounded-xl border border-border/50 bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent dark:bg-surface-dark-1"
                    />
                  </div>
                ) : null}
                {selection.config?.require_client_note ? (
                  <div>
                    <label
                      htmlFor="selection-client-note"
                      className="mb-1.5 block text-sm font-medium text-text"
                    >
                      Note
                    </label>
                    <textarea
                      id="selection-client-note"
                      value={startForm.client_note ?? ''}
                      onChange={(event) =>
                        setStartForm((prev) => ({ ...prev, client_note: event.target.value }))
                      }
                      placeholder="Note"
                      aria-invalid={startFormError ? 'true' : undefined}
                      aria-describedby={startFormError ? 'selection-start-error' : undefined}
                      className="w-full min-h-20 rounded-xl border border-border/50 bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent dark:bg-surface-dark-1"
                    />
                  </div>
                ) : null}

                {startFormError ? (
                  <div
                    id="selection-start-error"
                    role="alert"
                    className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
                  >
                    {startFormError}
                  </div>
                ) : null}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      selection.closeStartModal();
                      setOpenFavoritesAfterStart(false);
                    }}
                    className="rounded-xl border border-border/50 px-3 py-2 text-sm font-semibold text-text"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={selection.isMutating}
                    onClick={() => {
                      setStartFormError('');
                      selection
                        .startSession({
                          client_name: startForm.client_name,
                          client_email: startForm.client_email || null,
                          client_phone: startForm.client_phone || null,
                          client_note: startForm.client_note || null,
                        })
                        .then(() => {
                          setStartForm(createInitialStartForm());
                        })
                        .catch((err) => {
                          setStartFormError(
                            handleApiError(err).message || 'Failed to start session',
                          );
                        });
                    }}
                    className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          </AppDialog>
        ) : null}

        <div className="mt-16 flex flex-wrap items-center justify-center gap-3 text-center text-sm font-medium text-muted dark:text-muted-foreground">
          <p>Powered by Viewport - Your Photo Gallery Solution</p>
          <Link to="/accessibility" className="font-semibold text-accent hover:underline">
            Accessibility
          </Link>
        </div>
      </main>

      {showStickyProjectSelectionBar ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:px-6 lg:px-10">
          <section
            data-testid="project-selection-sticky-bar"
            className="pointer-events-auto mx-auto flex w-full max-w-6xl flex-col gap-3 rounded-3xl border border-border/50 bg-surface/95 px-4 py-4 shadow-xl backdrop-blur-xl dark:bg-surface-dark/95 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                Project selection
              </p>
              <div className="flex flex-wrap items-center gap-2 text-sm text-text">
                <span className="rounded-full bg-accent/10 px-3 py-1 font-semibold text-accent">
                  {selection.session?.selected_count ?? 0} selected
                </span>
                {selection.config?.limit_enabled && selection.config.limit_value ? (
                  <span className="text-muted">Limit {selection.config.limit_value}</span>
                ) : null}
                {selection.session?.status ? (
                  <span className="text-muted">Status: {selection.session.status}</span>
                ) : (
                  <span className="text-muted">
                    Start selecting in any gallery to keep one shared shortlist.
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleOpenFavorites}
                className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:border-accent/40 hover:text-accent"
              >
                <Heart className="h-4 w-4" />
                Open favorites
              </button>
              <button
                type="button"
                onClick={handleStickyFinishSelection}
                disabled={
                  selection.isMutating || Boolean(selection.session && !selection.canMutateSession)
                }
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                Finish selection
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {renderLightbox(lightboxSlides, displayedPhotos.length)}
    </div>
  );
};
