import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  ImageIcon,
  ImageOff,
  Loader2,
  Maximize2,
  Minimize2,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import type { GalleryPhoto } from '../../types/photo';
import type {
  CoverDisplayOption,
  GalleryDetail,
  PhotoSpacing,
  PublicColorScheme,
} from '../../types/gallery';
import type { PublicPhoto } from '../../types/sharelink';
import { AppDialog, AppDialogDescription, AppDialogTitle } from '../ui';
import {
  getPublicGallerySpacingClassName,
  getPublicGalleryThemeClassName,
  normalizePublicGalleryAppearance,
  toHeroObjectPosition,
} from '../public-gallery/galleryAppearance';
import { PublicGalleryHero } from '../public-gallery/PublicGalleryHero';
import { PublicGalleryPhotoSection } from '../public-gallery/PublicGalleryPhotoSection';
import { usePhotoLightbox } from '../../hooks/usePhotoLightbox';
import { useAuthStore } from '../../stores/authStore';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const SAVE_STATUS_LABELS: Record<SaveStatus, string> = {
  idle: '',
  dirty: 'Unsaved changes',
  saving: 'Saving changes…',
  saved: 'All changes saved',
  error: 'Could not save appearance. Your preview still shows unsaved changes.',
};

const AUTOSAVE_DEBOUNCE_MS = 450;
const MAX_PREVIEW_PHOTOS = 12;
const COVER_PICKER_PAGE_SIZE = 100;

const formatPublicGalleryDate = (value?: string | null): string => {
  if (!value) return '';

  const datePart = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (match) {
    const [, year, month, day] = match;
    return `${day}.${month}.${year}`;
  }

  return value;
};

interface AppearanceDraft {
  cover_photo_id: string | null;
  cover_focal_x: number;
  cover_focal_y: number;
  cover_display_option: CoverDisplayOption;
  public_photo_spacing: PhotoSpacing;
  public_color_scheme: PublicColorScheme;
}

interface GalleryAppearanceSectionProps {
  gallery: GalleryDetail;
  photos: GalleryPhoto[];
  isLoadingPhotos: boolean;
  onLoadCoverPhotos: (options: { limit: number; offset: number }) => Promise<{
    photos: GalleryPhoto[];
    total: number;
  }>;
  onSaveAppearance: (
    payload: Partial<
      Pick<
        GalleryDetail,
        | 'cover_photo_id'
        | 'cover_focal_x'
        | 'cover_focal_y'
        | 'cover_display_option'
        | 'public_photo_spacing'
        | 'public_color_scheme'
      >
    >,
  ) => Promise<GalleryDetail>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampFocal(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Cover display option visual mocks
// ---------------------------------------------------------------------------

const DISPLAY_OPTION_CONFIG: {
  value: CoverDisplayOption;
  label: string;
  renderMock: () => ReactNode;
}[] = [
  {
    value: 'centered_title',
    label: 'Centered title',
    renderMock: () => (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1">
        <div className="h-1 w-3/5 rounded-full bg-white/80" />
        <div className="h-0.5 w-2/5 rounded-full bg-white/50" />
        <div className="h-0.5 w-1/3 rounded-full bg-white/40" />
      </div>
    ),
  },
  {
    value: 'text_block',
    label: 'Cover with text block',
    renderMock: () => (
      <div className="flex h-full w-full flex-col justify-end p-1.5">
        <div className="rounded-md bg-white/60 p-1 backdrop-blur-sm">
          <div className="h-1 w-3/4 rounded-full bg-white/90" />
          <div className="mt-0.5 h-0.5 w-1/2 rounded-full bg-white/70" />
        </div>
      </div>
    ),
  },
  {
    value: 'minimalist',
    label: 'Minimalist cover',
    renderMock: () => (
      <div className="flex h-full w-full flex-col justify-end p-1.5">
        <div className="h-1 w-2/3 rounded-full bg-white/90" />
        <div className="mt-0.5 flex gap-1">
          <div className="h-0.5 w-8 rounded-full bg-white/50" />
          <div className="h-0.5 w-6 rounded-full bg-white/30" />
        </div>
      </div>
    ),
  },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const GalleryAppearanceSection = ({
  gallery,
  photos,
  isLoadingPhotos,
  onLoadCoverPhotos,
  onSaveAppearance,
}: GalleryAppearanceSectionProps) => {
  const currentUser = useAuthStore((state) => state.user);
  // -- draft state ----------------------------------------------------------
  const [draft, setDraft] = useState<AppearanceDraft>({
    cover_photo_id: gallery.cover_photo_id ?? null,
    cover_focal_x: gallery.cover_focal_x ?? 50,
    cover_focal_y: gallery.cover_focal_y ?? 50,
    cover_display_option: gallery.cover_display_option ?? 'centered_title',
    public_photo_spacing: gallery.public_photo_spacing ?? 'medium',
    public_color_scheme: gallery.public_color_scheme ?? 'light',
  });

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [isCoverPickerOpen, setIsCoverPickerOpen] = useState(false);
  const [coverPickerPhotos, setCoverPickerPhotos] = useState<GalleryPhoto[]>(photos);
  const [coverPickerTotal, setCoverPickerTotal] = useState(gallery.total_photos ?? photos.length);
  const [isLoadingCoverPickerPhotos, setIsLoadingCoverPickerPhotos] = useState(false);
  const [coverPickerError, setCoverPickerError] = useState('');
  const [previewTab, setPreviewTab] = useState<'cover' | 'gallery'>('cover');
  const prevGalleryIdRef = useRef(gallery.id);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDraftRef = useRef<AppearanceDraft>(draft);
  const previewGridRef = useRef<HTMLDivElement | null>(null);
  const previewObserverRef = useRef<HTMLDivElement | null>(null);
  const coverPickerScrollRef = useRef<HTMLDivElement | null>(null);
  const coverPickerLoadMoreRef = useRef<HTMLDivElement | null>(null);

  // Reset draft when switching galleries
  useEffect(() => {
    if (gallery.id !== prevGalleryIdRef.current) {
      prevGalleryIdRef.current = gallery.id;
      const next: AppearanceDraft = {
        cover_photo_id: gallery.cover_photo_id ?? null,
        cover_focal_x: gallery.cover_focal_x ?? 50,
        cover_focal_y: gallery.cover_focal_y ?? 50,
        cover_display_option: gallery.cover_display_option ?? 'centered_title',
        public_photo_spacing: gallery.public_photo_spacing ?? 'medium',
        public_color_scheme: gallery.public_color_scheme ?? 'light',
      };
      setDraft(next);
      setCoverPickerPhotos(photos);
      setCoverPickerTotal(gallery.total_photos ?? photos.length);
      setCoverPickerError('');
      lastSavedDraftRef.current = next;
      setSaveStatus('idle');
    }
  }, [
    gallery.id,
    gallery.total_photos,
    gallery.cover_photo_id,
    gallery.cover_focal_x,
    gallery.cover_focal_y,
    gallery.cover_display_option,
    gallery.public_photo_spacing,
    gallery.public_color_scheme,
    photos,
  ]);

  // -- autosave -------------------------------------------------------------
  const triggerSave = useCallback(
    (nextDraft: AppearanceDraft) => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);

      setSaveStatus('dirty');

      debounceRef.current = setTimeout(async () => {
        setSaveStatus('saving');
        try {
          const updated = await onSaveAppearance({
            cover_photo_id: nextDraft.cover_photo_id,
            cover_focal_x: nextDraft.cover_focal_x,
            cover_focal_y: nextDraft.cover_focal_y,
            cover_display_option: nextDraft.cover_display_option,
            public_photo_spacing: nextDraft.public_photo_spacing,
            public_color_scheme: nextDraft.public_color_scheme,
          });
          // Sync back from server response
          const synced: AppearanceDraft = {
            cover_photo_id: updated.cover_photo_id ?? null,
            cover_focal_x: updated.cover_focal_x ?? 50,
            cover_focal_y: updated.cover_focal_y ?? 50,
            cover_display_option: updated.cover_display_option ?? 'centered_title',
            public_photo_spacing: updated.public_photo_spacing ?? 'medium',
            public_color_scheme: updated.public_color_scheme ?? 'light',
          };
          setDraft(synced);
          lastSavedDraftRef.current = synced;
          setSaveStatus('saved');
        } catch {
          setSaveStatus('error');
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [onSaveAppearance],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // -- draft helpers --------------------------------------------------------
  const updateDraft = useCallback(
    (patch: Partial<AppearanceDraft>) => {
      setDraft((prev) => {
        const next = { ...prev, ...patch };
        triggerSave(next);
        return next;
      });
    },
    [triggerSave],
  );

  const loadCoverPickerPhotos = useCallback(
    async ({ offset, replace }: { offset: number; replace: boolean }) => {
      setIsLoadingCoverPickerPhotos(true);
      setCoverPickerError('');

      try {
        const result = await onLoadCoverPhotos({
          limit: COVER_PICKER_PAGE_SIZE,
          offset,
        });

        setCoverPickerTotal(result.total);
        setCoverPickerPhotos((prev) => {
          const source = replace ? [] : prev;
          const byId = new Map(source.map((photo) => [photo.id, photo]));
          for (const photo of result.photos) {
            byId.set(photo.id, photo);
          }
          return Array.from(byId.values());
        });
      } catch {
        setCoverPickerError('Could not load more photos. Try again.');
      } finally {
        setIsLoadingCoverPickerPhotos(false);
      }
    },
    [onLoadCoverPhotos],
  );

  const handleOpenCoverPicker = useCallback(() => {
    setIsCoverPickerOpen(true);
    void loadCoverPickerPhotos({ offset: 0, replace: true });
  }, [loadCoverPickerPhotos]);

  const hasMoreCoverPickerPhotos = coverPickerPhotos.length < coverPickerTotal;

  const handleLoadMoreCoverPhotos = useCallback(() => {
    if (!isCoverPickerOpen || isLoadingCoverPickerPhotos || !hasMoreCoverPickerPhotos) {
      return;
    }

    void loadCoverPickerPhotos({
      offset: coverPickerPhotos.length,
      replace: false,
    });
  }, [
    coverPickerPhotos.length,
    hasMoreCoverPickerPhotos,
    isCoverPickerOpen,
    isLoadingCoverPickerPhotos,
    loadCoverPickerPhotos,
  ]);

  useEffect(() => {
    if (!isCoverPickerOpen || isLoadingCoverPickerPhotos || !hasMoreCoverPickerPhotos) {
      return;
    }

    const target = coverPickerLoadMoreRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          handleLoadMoreCoverPhotos();
        }
      },
      {
        root: coverPickerScrollRef.current,
        rootMargin: '360px 0px',
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [
    handleLoadMoreCoverPhotos,
    hasMoreCoverPickerPhotos,
    isCoverPickerOpen,
    isLoadingCoverPickerPhotos,
  ]);

  const coverPreviewSlides = coverPickerPhotos.map((photo) => ({
    src: photo.url,
    thumbnailSrc: photo.thumbnail_url,
    alt: photo.filename,
    download: false,
  }));

  const { openLightbox: openCoverPreview, renderLightbox: renderCoverPreviewLightbox } =
    usePhotoLightbox({
      onLoadMore: handleLoadMoreCoverPhotos,
      hasMore: hasMoreCoverPickerPhotos,
      isLoadingMore: isLoadingCoverPickerPhotos,
    });

  const knownPhotos = (() => {
    const byId = new Map<string, GalleryPhoto>();
    for (const photo of photos) {
      byId.set(photo.id, photo);
    }
    for (const photo of coverPickerPhotos) {
      byId.set(photo.id, photo);
    }
    return Array.from(byId.values());
  })();

  // -- effective cover ------------------------------------------------------
  const effectiveCover = draft.cover_photo_id
    ? (knownPhotos.find((p) => p.id === draft.cover_photo_id) ?? null)
    : (coverPickerPhotos[0] ?? photos[0] ?? null);

  const effectiveCoverPayload: {
    photo_id: string;
    full_url: string;
    thumbnail_url: string;
  } | null = effectiveCover
    ? {
        photo_id: effectiveCover.id,
        full_url: effectiveCover.url,
        thumbnail_url: effectiveCover.thumbnail_url,
      }
    : null;
  const effectiveCoverFilename = effectiveCover?.filename ?? 'Automatic cover';
  const selectedCoverLabel =
    draft.cover_photo_id === null
      ? 'Automatic fallback'
      : (effectiveCover?.filename ?? 'Selected cover');

  // -- preview helpers ------------------------------------------------------
  const previewPhotos: PublicPhoto[] = photos.slice(0, MAX_PREVIEW_PHOTOS).map((photo) => ({
    photo_id: photo.id,
    thumbnail_url: photo.thumbnail_url,
    full_url: photo.url,
    filename: photo.filename,
  }));

  const previewAppearance = normalizePublicGalleryAppearance({
    cover_focal_x: draft.cover_focal_x,
    cover_focal_y: draft.cover_focal_y,
    cover_display_option: draft.cover_display_option,
    photo_spacing: draft.public_photo_spacing,
    color_scheme: draft.public_color_scheme,
  });
  const previewHeroDate = formatPublicGalleryDate(gallery.shooting_date);
  const previewHeroPhotographer = currentUser?.display_name ?? undefined;

  const previewGridClassNames = [
    'grid',
    'grid-cols-[repeat(auto-fill,minmax(180px,1fr))]',
    'gap-3',
    getPublicGallerySpacingClassName(previewAppearance.photo_spacing),
  ].join(' ');

  // -- focal point click handler -------------------------------------------
  const handleFocalClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = clampFocal(((event.clientX - rect.left) / rect.width) * 100);
      const y = clampFocal(((event.clientY - rect.top) / rect.height) * 100);
      updateDraft({ cover_focal_x: x, cover_focal_y: y });
    },
    [updateDraft],
  );

  const handleSelectCoverPhoto = useCallback(
    (photoId: string | null) => {
      setIsCoverPickerOpen(false);
      if (photoId === draft.cover_photo_id) {
        return;
      }
      updateDraft({ cover_photo_id: photoId });
    },
    [draft.cover_photo_id, updateDraft],
  );

  // -- render ---------------------------------------------------------------
  if (isLoadingPhotos) {
    return (
      <div className="space-y-8">
        <div className="rounded-3xl border border-border/40 bg-surface-1/25 p-8 dark:border-border/20">
          <div className="flex items-center gap-4">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
            <span className="text-sm font-medium text-muted">
              Loading gallery appearance settings…
            </span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-48 animate-pulse rounded-2xl bg-surface-foreground/10 dark:bg-surface/20"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-[72vh] overflow-hidden border border-border/30 bg-surface shadow-xs dark:border-border/20 dark:bg-surface-dark lg:grid-cols-[350px_minmax(0,1fr)]">
      <aside className="space-y-8 bg-surface px-6 py-8 dark:bg-surface-dark lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:px-8">
        <h2 className="text-2xl font-semibold tracking-tight text-text">Appearance</h2>

        {/* ---- Save status ---- */}
        {saveStatus !== 'idle' && (
          <div
            aria-live="polite"
            className={`rounded-xl px-4 py-2.5 text-sm font-medium ${
              saveStatus === 'saving'
                ? 'bg-surface-foreground/10 text-muted dark:bg-surface/20'
                : saveStatus === 'saved'
                  ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : saveStatus === 'error'
                    ? 'bg-danger/10 text-danger dark:bg-danger/20'
                    : 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
            }`}
          >
            {saveStatus === 'saving' && (
              <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin align-[-2px]" />
            )}
            {SAVE_STATUS_LABELS[saveStatus]}
          </div>
        )}

        {/* ---- Cover picker ---- */}
        <section>
          <h3 className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-text">
            Cover image
          </h3>
          {photos.length === 0 ? (
            <div className="border border-dashed border-border/50 bg-surface-1/20 px-4 py-8 text-center dark:border-border/30 dark:bg-surface-dark-1/20">
              <ImageOff className="mx-auto mb-2 h-8 w-8 text-muted" />
              <p className="text-sm font-medium text-muted">
                Upload photos first to choose a cover
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleOpenCoverPicker}
                className="inline-flex min-h-10 items-center justify-center rounded-full bg-surface-1 px-6 text-[11px] font-black uppercase tracking-[0.14em] text-text transition-all duration-200 hover:bg-surface-2 active:scale-95 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent dark:bg-surface-dark-1 dark:hover:bg-surface-dark-2"
              >
                Select cover image
              </button>
              <p className="truncate text-xs font-medium text-muted" title={effectiveCoverFilename}>
                {selectedCoverLabel}
              </p>
            </div>
          )}

          <AppDialog
            open={isCoverPickerOpen}
            onClose={() => setIsCoverPickerOpen(false)}
            size="5xl"
            panelProps={{ 'data-lenis-prevent': true }}
            panelClassName="flex max-h-[min(92vh,56rem)] flex-col overflow-hidden rounded-3xl border border-border/50 bg-surface shadow-2xl dark:border-border/40 dark:bg-surface-dark"
          >
            <div className="flex shrink-0 items-center gap-4 border-b border-border/50 bg-surface/95 px-5 py-4 backdrop-blur-md dark:border-border/40 dark:bg-surface-dark/95 sm:px-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <ImageIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <AppDialogTitle className="truncate text-lg font-bold leading-tight text-text">
                  Select cover image
                </AppDialogTitle>
                <AppDialogDescription className="truncate text-sm text-muted">
                  {coverPickerTotal} photos · current: {selectedCoverLabel}
                </AppDialogDescription>
              </div>
              <button
                type="button"
                onClick={() => setIsCoverPickerOpen(false)}
                aria-label="Close cover image picker"
                className="rounded-xl p-2 text-muted transition-all duration-200 hover:bg-surface-1 hover:text-text active:scale-95 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent dark:hover:bg-surface-dark-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div ref={coverPickerScrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              {coverPickerError && (
                <div className="mb-4 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
                  {coverPickerError}
                </div>
              )}
              <button
                type="button"
                onClick={() => handleSelectCoverPhoto(null)}
                className={`mb-4 flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
                  draft.cover_photo_id === null
                    ? 'border-accent bg-accent/10 text-text'
                    : 'border-border/40 bg-surface-1/40 text-muted hover:border-border/70 hover:text-text dark:bg-surface-dark-1/60'
                }`}
                aria-pressed={draft.cover_photo_id === null}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-muted dark:bg-surface-dark">
                  <ImageIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Use first photo automatically</span>
                  <span className="block truncate text-xs text-muted">
                    Current fallback:{' '}
                    {coverPickerPhotos[0]?.filename ??
                      photos[0]?.filename ??
                      'first uploaded photo'}
                  </span>
                </span>
                {draft.cover_photo_id === null && (
                  <Check className="h-5 w-5 shrink-0 text-accent" />
                )}
              </button>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {coverPickerPhotos.map((photo, photoIndex) => {
                  const isSelected = draft.cover_photo_id === photo.id;
                  const isFallback =
                    draft.cover_photo_id === null &&
                    (coverPickerPhotos[0]?.id ?? photos[0]?.id) === photo.id;

                  return (
                    <div
                      key={photo.id}
                      className={`group relative overflow-hidden rounded-2xl border-2 bg-surface-1 text-left transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:bg-surface-dark-1 ${
                        isSelected
                          ? 'border-accent ring-2 ring-accent/35'
                          : 'border-border/30 hover:border-border/70'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectCoverPhoto(photo.id)}
                        className="block w-full text-left focus:outline-hidden"
                        aria-pressed={isSelected}
                        aria-label={
                          photo.filename ? `Select ${photo.filename} as cover` : 'Select as cover'
                        }
                      >
                        <img
                          src={photo.thumbnail_url}
                          alt=""
                          className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/45 to-transparent p-3 pt-10">
                          <p
                            className="truncate text-sm font-semibold text-white"
                            title={photo.filename}
                          >
                            {photo.filename}
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => openCoverPreview(photoIndex)}
                        aria-label={
                          photo.filename
                            ? `Preview ${photo.filename} full screen`
                            : 'Preview photo full screen'
                        }
                        className="absolute left-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-black/60 text-white shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-black/75 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white/80"
                      >
                        <Maximize2 className="h-4 w-4" />
                      </button>
                      {isFallback && (
                        <span className="absolute left-3 top-14 rounded-lg bg-amber-500/95 px-2 py-1 text-[11px] font-bold text-white shadow-sm">
                          Fallback
                        </span>
                      )}
                      {isSelected && (
                        <span
                          className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg bg-accent px-2 py-1 text-[11px] font-bold text-accent-foreground shadow-sm ${
                            isFallback ? 'max-w-[calc(100%-4.75rem)]' : ''
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Cover
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {isLoadingCoverPickerPhotos && coverPickerPhotos.length === 0 && (
                <div className="flex justify-center py-10 text-sm font-medium text-muted">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading photos…
                </div>
              )}

              {hasMoreCoverPickerPhotos && (
                <div
                  ref={coverPickerLoadMoreRef}
                  className="mt-6 flex min-h-14 items-center justify-center text-sm font-medium text-muted"
                  aria-live="polite"
                >
                  {isLoadingCoverPickerPhotos ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading more photos…
                    </>
                  ) : (
                    <span>
                      {coverPickerPhotos.length}/{coverPickerTotal} loaded
                    </span>
                  )}
                </div>
              )}
            </div>
          </AppDialog>
          {renderCoverPreviewLightbox(coverPreviewSlides, coverPickerTotal)}
          {photos.length > 0 && draft.cover_photo_id === null && (
            <p className="mt-2 text-xs text-muted">
              Current fallback cover:{' '}
              <span className="font-medium text-text">{photos[0]?.filename ?? '—'}</span>
            </p>
          )}
        </section>

        {/* ---- Focal point ---- */}
        <section>
          <h3 className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-text">
            Image center
          </h3>
          {effectiveCoverPayload ? (
            <div className="space-y-3">
              <button
                type="button"
                aria-label="Click to set focal point"
                className="relative flex h-[11.25rem] w-full cursor-crosshair items-center justify-center overflow-hidden border border-border/50 bg-surface p-0 dark:border-border/30 dark:bg-surface-dark-1"
                onClick={handleFocalClick}
              >
                <img
                  src={effectiveCoverPayload.thumbnail_url}
                  alt=""
                  className="h-full w-auto object-cover"
                  style={{
                    objectPosition: toHeroObjectPosition(
                      normalizePublicGalleryAppearance({
                        cover_focal_x: draft.cover_focal_x,
                        cover_focal_y: draft.cover_focal_y,
                      }),
                    ),
                  }}
                  draggable={false}
                />
                {/* Focal point marker */}
                <div
                  className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent/80 shadow-lg"
                  style={{
                    left: `${draft.cover_focal_x}%`,
                    top: `${draft.cover_focal_y}%`,
                  }}
                />
              </button>
              <p className="text-xs font-medium text-muted">
                X {draft.cover_focal_x}% · Y {draft.cover_focal_y}%
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 border border-dashed border-border/50 bg-surface-1/20 px-4 py-6 text-sm text-muted dark:border-border/30 dark:bg-surface-dark-1/20">
              <ImageOff className="h-5 w-5 shrink-0" />
              <span>Add a cover photo to adjust the focal point</span>
            </div>
          )}
        </section>

        {/* ---- Cover display option ---- */}
        <section>
          <h3 className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-text">
            Cover variants
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {DISPLAY_OPTION_CONFIG.map((option) => {
              const isSelected = draft.cover_display_option === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    updateDraft({
                      cover_display_option: option.value,
                    })
                  }
                  className={`flex aspect-square flex-col justify-between border p-2 text-left transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                    isSelected
                      ? 'border-text bg-surface ring-1 ring-text dark:border-text dark:bg-surface-dark'
                      : 'border-border/50 bg-surface hover:border-text/50 dark:border-border/30 dark:bg-surface-dark-1'
                  }`}
                  aria-pressed={isSelected}
                >
                  <div className="h-[3.25rem] overflow-hidden border border-border/40 bg-linear-to-br from-slate-700 via-slate-600 to-slate-800 dark:border-border/30">
                    {option.renderMock()}
                  </div>
                  <span
                    className={`text-[8px] font-black uppercase tracking-[0.14em] ${
                      isSelected ? 'text-text' : 'text-muted'
                    }`}
                  >
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ---- Photo spacing ---- */}
        <section>
          <h3 className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-text">
            Photo spacing
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'large' as PhotoSpacing, label: 'Large', icon: Maximize2 },
              { value: 'medium' as PhotoSpacing, label: 'Medium', icon: ImageIcon },
              { value: 'small' as PhotoSpacing, label: 'Small', icon: Minimize2 },
            ].map(({ value, label, icon: Icon }) => {
              const isSelected = draft.public_photo_spacing === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateDraft({ public_photo_spacing: value })}
                  className={`flex aspect-square flex-col items-center justify-center gap-2 border text-[8px] font-black uppercase tracking-[0.14em] transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
                    isSelected
                      ? 'border-text bg-surface text-text ring-1 ring-text dark:bg-surface-dark'
                      : 'border-border/50 bg-surface text-muted hover:border-text/50 dark:border-border/30 dark:bg-surface-dark-1'
                  }`}
                  aria-pressed={isSelected}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        {/* ---- Color scheme ---- */}
        <section>
          <h3 className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-text">
            Color scheme
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { value: 'light' as PublicColorScheme, label: 'Light', icon: Sun },
              { value: 'dark' as PublicColorScheme, label: 'Dark', icon: Moon },
            ].map(({ value, label, icon: Icon }) => {
              const isSelected = draft.public_color_scheme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateDraft({ public_color_scheme: value })}
                  className={`flex h-[4.75rem] flex-col items-center justify-center gap-2 border text-[8px] font-black uppercase tracking-[0.14em] transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
                    isSelected
                      ? 'border-text bg-surface text-text ring-1 ring-text dark:bg-surface-dark'
                      : 'border-border/50 bg-surface text-muted hover:border-text/50 dark:border-border/30 dark:bg-surface-dark-1'
                  }`}
                  aria-pressed={isSelected}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              );
            })}
          </div>
        </section>
      </aside>

      <section className="flex min-h-[42rem] flex-col bg-surface-1 px-6 py-10 dark:bg-surface-dark-1 lg:px-11 lg:py-[4.5rem]">
        <div className="mx-auto flex w-full max-w-xl border-b border-border/50 dark:border-border/30">
          {[
            { key: 'cover' as const, label: 'Cover' },
            { key: 'gallery' as const, label: 'Gallery' },
          ].map((tab) => {
            const isSelected = previewTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPreviewTab(tab.key)}
                className={`min-h-12 flex-1 border-b-2 text-sm font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
                  isSelected
                    ? 'border-text text-text'
                    : 'border-transparent text-muted hover:text-text'
                }`}
                aria-pressed={isSelected}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-1 items-start justify-center pt-[4.5rem]">
          {previewTab === 'cover' ? (
            <div className="relative w-full max-w-6xl">
              <div className="mb-2 text-xl font-bold leading-none text-muted/50">...</div>
              <div className="flex flex-col items-center gap-6 xl:flex-row xl:items-end xl:justify-center">
                <div className="w-full max-w-4xl">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
                    Desktop 16:9
                  </p>
                  <div
                    className={`pg-public-page ${getPublicGalleryThemeClassName(previewAppearance)} aspect-video overflow-hidden bg-surface text-text shadow-sm [&_.pg-hero]:!h-full [&_.pg-hero]:!min-h-full`}
                  >
                    <PublicGalleryHero
                      title={gallery.name}
                      date={previewHeroDate}
                      photographer={previewHeroPhotographer}
                      cover={effectiveCoverPayload}
                      appearance={previewAppearance}
                    />
                  </div>
                </div>

                <div className="w-[15rem] shrink-0">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
                    Phone 9:16
                  </p>
                  <div className="rounded-[1.75rem] border-[3px] border-black bg-black p-1 shadow-2xl">
                    <div className="relative aspect-[9/16] overflow-hidden rounded-[1.35rem] bg-surface">
                      <div className="absolute left-0 top-0 h-[693px] w-[390px] origin-top-left scale-[0.615]">
                        <div
                          className={`pg-public-page ${getPublicGalleryThemeClassName(previewAppearance)} h-full w-full bg-surface text-text [&_.pg-hero]:!h-full [&_.pg-hero]:!min-h-full`}
                        >
                          <PublicGalleryHero
                            title={gallery.name}
                            date={previewHeroDate}
                            photographer={previewHeroPhotographer}
                            cover={effectiveCoverPayload}
                            appearance={previewAppearance}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              className={`pg-public-page ${getPublicGalleryThemeClassName(previewAppearance)} w-full max-w-3xl overflow-hidden bg-surface text-text shadow-sm`}
            >
              <div className="border-b border-border/40 px-5 py-4 dark:border-border/30">
                <p className="text-sm font-semibold text-text">{gallery.name}</p>
                <p className="text-xs text-muted">
                  {previewPhotos.length} of {photos.length} photos
                </p>
              </div>
              <div className="p-4">
                <PublicGalleryPhotoSection
                  photos={previewPhotos}
                  totalPhotos={photos.length}
                  displayedPhotos={previewPhotos.length}
                  gridClassNames={previewGridClassNames}
                  showGridControls={false}
                  gridLayout="masonry"
                  gridDensity="large"
                  gridRef={previewGridRef}
                  getAspectRatioHint={() => 1}
                  observerTargetRef={previewObserverRef}
                  isLoadingMore={false}
                  hasMore={false}
                  onLayoutChange={() => {}}
                  onDensityChange={() => {}}
                  onOpenPhoto={() => {}}
                  touchHandlers={{
                    onTouchStart: () => {},
                    onTouchMove: () => {},
                    onTouchEnd: () => {},
                    onTouchCancel: () => {},
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
