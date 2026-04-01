import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download as DownloadIcon } from 'lucide-react';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { PublicGalleryHero } from '../components/public-gallery/PublicGalleryHero';
import { PublicGalleryPhotoSection } from '../components/public-gallery/PublicGalleryPhotoSection';
import {
  PublicGalleryError,
  PublicGalleryExpired,
} from '../components/public-gallery/PublicGalleryStates';
import { usePhotoLightbox } from '../hooks/usePhotoLightbox';
import { usePublicGallery, usePublicSelection } from '../hooks';
import { usePublicGalleryGrid } from '../hooks/usePublicGalleryGrid';
import { isDemoModeEnabled } from '../lib/demoMode';
import { getDemoService } from '../services/demoService';
import { handleApiError } from '../lib/errorHandling';
import type { SelectionSessionStartRequest } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const PublicGalleryPage = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const [startForm, setStartForm] = useState<SelectionSessionStartRequest>({
    client_name: '',
    client_email: '',
    client_phone: '',
    client_note: '',
  });
  const [startFormError, setStartFormError] = useState('');
  const [sessionNoteDraft, setSessionNoteDraft] = useState('');
  const [showSelectionSection, setShowSelectionSection] = useState(false);

  const { gallery, photos, isLoading, isLoadingMore, hasMore, error, errorStatus, loadMorePhotos } =
    usePublicGallery({ shareId });

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
  } = usePublicGalleryGrid({ photos });

  const selection = usePublicSelection({
    shareId,
    photoIds: photos.map((photo) => photo.photo_id),
  });

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

  const { openLightbox, renderLightbox } = usePhotoLightbox({
    photoCardSelector: '.pg-card',
    gridRef,
    onLoadMore: () => loadMorePhotosRef.current?.(),
    hasMore,
    isLoadingMore,
    loadMoreThreshold: 10,
  });

  useEffect(() => {
    loadMorePhotosRef.current = loadMorePhotos;
  }, [loadMorePhotos]);

  useEffect(() => {
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
  }, [hasMore, isLoadingMore, loadMorePhotos]);

  const handleDownloadAll = () => {
    if (!shareId) return;
    if (isDemoModeEnabled()) {
      getDemoService().downloadSharedGalleryZip(shareId);
      return;
    }

    window.open(`${API_BASE_URL}/s/${shareId}/download/all`, '_blank');
  };

  const displayedPhotos = useMemo(
    () =>
      selection.selectedOnly
        ? photos.filter((photo) => selection.selectedIds.has(photo.photo_id))
        : photos,
    [photos, selection.selectedIds, selection.selectedOnly],
  );

  const lightboxSlides = useMemo(
    () =>
      displayedPhotos.map((photo) => ({
        src: photo.full_url,
        thumbnailSrc: photo.thumbnail_url,
        width: photo.width || undefined,
        height: photo.height || undefined,
        alt: photo.filename || `Photo ${photo.photo_id}`,
        download: photo.full_url,
        downloadFilename: photo.filename || `photo-${photo.photo_id}.jpg`,
      })),
    [displayedPhotos],
  );

  if (isLoading) {
    return null;
  }

  if (error) {
    if (errorStatus === 410) {
      return <PublicGalleryExpired />;
    }
    return <PublicGalleryError error={error} />;
  }

  return (
    <div className="min-h-screen bg-surface dark:bg-surface-foreground/5 text-text dark:text-accent-foreground">
      <div className="fixed top-6 right-6 z-30">
        <ThemeSwitch variant="inline" />
      </div>

      <PublicGalleryHero gallery={gallery} />

      <div id="gallery-content" className="w-full px-4 sm:px-6 lg:px-10 py-16">
        {photos.length > 0 && (
          <div className="mb-10 text-center">
            <button
              onClick={handleDownloadAll}
              className="bg-accent hover:bg-accent/90 text-accent-foreground px-8 py-3.5 rounded-xl font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 inline-flex items-center gap-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <DownloadIcon className="w-5 h-5" />
              Download All Photos
            </button>
          </div>
        )}

        <PublicGalleryPhotoSection
          photos={displayedPhotos}
          totalPhotos={gallery?.total_photos ?? photos.length}
          displayedPhotos={displayedPhotos.length}
          gridClassNames={gridClassNames}
          gridLayout={gridLayout}
          gridDensity={gridDensity}
          gridRef={gridRef}
          observerTargetRef={observerTargetRef}
          isLoadingMore={isLoadingMore}
          hasMore={hasMore}
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
                  limitEnabled: selection.config.limit_enabled,
                  limitValue: selection.config.limit_value,
                  selectedOnly: selection.selectedOnly,
                  canMutate: selection.canMutateSession,
                  allowPhotoComments: selection.config.allow_photo_comments,
                  commentsByPhotoId: selection.commentsByPhotoId,
                  onToggleSelectedOnly: () => selection.setSelectedOnly(!selection.selectedOnly),
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

        {selection.error ? (
          <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {selection.error}
          </div>
        ) : null}

        {selection.config?.is_enabled ? (
          <div className="mt-8 rounded-2xl border border-border/50 bg-surface-1/70 p-5">
            <h3 className="text-lg font-semibold text-text">
              {selection.config.list_title || 'Photo selection'}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {selection.session
                ? `Status: ${selection.session.status}`
                : 'Start a selection session to mark photos for the photographer.'}
            </p>

            {selection.session ? (
              <div className="mt-4 space-y-3">
                <textarea
                  value={sessionNoteDraft}
                  onChange={(event) => setSessionNoteDraft(event.target.value)}
                  onBlur={(event) => {
                    if (!selection.canMutateSession) return;
                    void selection.updateClientNote(event.currentTarget.value);
                  }}
                  disabled={!selection.canMutateSession}
                  className="w-full min-h-24 rounded-xl border border-border/50 bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-70"
                  placeholder="General note for selected photos"
                />
                <button
                  type="button"
                  disabled={!selection.canMutateSession || selection.isMutating}
                  onClick={() => {
                    void selection.submitSelection();
                  }}
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Submit selection
                </button>
              </div>
            ) : showSelectionSection ? (
              <button
                type="button"
                onClick={selection.openStartModal}
                className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
              >
                Start selection
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowSelectionSection(true)}
                className="mt-4 rounded-xl border border-border/50 bg-surface px-4 py-2 text-sm font-semibold text-text hover:border-accent/40"
              >
                Open selection panel
              </button>
            )}
          </div>
        ) : null}

        <div className="text-center mt-16 text-muted dark:text-muted-foreground text-sm font-medium">
          <p>Powered by Viewport - Your Photo Gallery Solution</p>
        </div>
      </div>

      {selection.showStartModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border/50 bg-surface p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-text">Start selection</h3>
            <p className="mt-2 text-sm text-muted">Enter your details to begin selecting photos.</p>
            <div className="mt-4 space-y-3">
              <input
                value={startForm.client_name}
                onChange={(event) =>
                  setStartForm((prev) => ({ ...prev, client_name: event.target.value }))
                }
                placeholder="Your name"
                className="w-full rounded-xl border border-border/50 bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
              />
              {selection.config?.require_email ? (
                <input
                  value={startForm.client_email ?? ''}
                  onChange={(event) =>
                    setStartForm((prev) => ({ ...prev, client_email: event.target.value }))
                  }
                  placeholder="Email"
                  className="w-full rounded-xl border border-border/50 bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
                />
              ) : null}
              {selection.config?.require_phone ? (
                <input
                  value={startForm.client_phone ?? ''}
                  onChange={(event) =>
                    setStartForm((prev) => ({ ...prev, client_phone: event.target.value }))
                  }
                  placeholder="Phone"
                  className="w-full rounded-xl border border-border/50 bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
                />
              ) : null}
              {selection.config?.require_client_note ? (
                <textarea
                  value={startForm.client_note ?? ''}
                  onChange={(event) =>
                    setStartForm((prev) => ({ ...prev, client_note: event.target.value }))
                  }
                  placeholder="Note"
                  className="w-full min-h-20 rounded-xl border border-border/50 bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
                />
              ) : null}

              {startFormError ? (
                <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {startFormError}
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={selection.closeStartModal}
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
                      .catch((err) => {
                        setStartFormError(handleApiError(err).message || 'Failed to start session');
                      });
                  }}
                  className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {renderLightbox(lightboxSlides, displayedPhotos.length)}
    </div>
  );
};
