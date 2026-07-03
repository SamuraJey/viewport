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
  normalizePublicGalleryAppearance,
  toHeroObjectPosition,
} from '../public-gallery/galleryAppearance';
import { PublicGalleryHero } from '../public-gallery/PublicGalleryHero';
import { PublicGalleryPhotoSection } from '../public-gallery/PublicGalleryPhotoSection';
import { usePhotoLightbox } from '../../hooks/usePhotoLightbox';

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
// Segmented button control
// ---------------------------------------------------------------------------

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div aria-label={label}>
      <div className="inline-flex overflow-hidden rounded-xl border border-border/40 bg-surface/70">
        {options.map((option, index) => {
          const isActive = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`relative flex cursor-pointer items-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-200 hover:bg-surface-2/50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
                index > 0 ? 'border-l border-border/50' : ''
              }`}
              aria-pressed={isActive}
            >
              {isActive && <div className="absolute inset-0 bg-accent shadow-sm" />}
              {option.icon && (
                <span
                  className={`relative z-10 ${
                    isActive ? 'text-accent-foreground' : 'text-text/80'
                  }`}
                >
                  {option.icon}
                </span>
              )}
              <span
                className={`relative z-10 ${
                  isActive ? 'font-semibold text-accent-foreground' : 'text-text/80'
                }`}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
    <div className="space-y-10">
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
        <h3 className="mb-3 text-lg font-bold text-text">Cover photo</h3>
        {photos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/50 bg-surface-1/20 px-4 py-8 text-center dark:border-border/30 dark:bg-surface-dark-1/20">
            <ImageOff className="mx-auto mb-2 h-8 w-8 text-muted" />
            <p className="text-sm font-medium text-muted">Upload photos first to choose a cover</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 rounded-2xl border border-border/40 bg-surface p-4 dark:border-border/30 dark:bg-surface-dark-1 sm:flex-row sm:items-center">
            <div className="relative w-full overflow-hidden rounded-xl bg-surface-1 sm:w-48">
              {effectiveCover ? (
                <>
                  <img
                    src={effectiveCover.thumbnail_url}
                    alt=""
                    className="aspect-video w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-black/55 px-3 py-2">
                    <p
                      className="truncate text-xs font-semibold text-white"
                      title={effectiveCoverFilename}
                    >
                      {effectiveCoverFilename}
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex aspect-video items-center justify-center">
                  <ImageOff className="h-8 w-8 text-muted" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-semibold text-text">{selectedCoverLabel}</p>
              <p className="text-sm text-muted">
                Pick a cover in a larger image browser, then fine-tune its focal point below.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenCoverPicker}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:bg-accent/90 active:scale-95 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <ImageIcon className="h-4 w-4" />
              Select cover image
            </button>
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
                  {coverPickerPhotos[0]?.filename ?? photos[0]?.filename ?? 'first uploaded photo'}
                </span>
              </span>
              {draft.cover_photo_id === null && <Check className="h-5 w-5 shrink-0 text-accent" />}
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
        <h3 className="mb-3 text-lg font-bold text-text">Focal point</h3>
        {effectiveCoverPayload ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <button
              type="button"
              aria-label="Click to set focal point"
              className="relative w-full max-w-xs cursor-crosshair overflow-hidden rounded-2xl border border-border/40 bg-transparent p-0 dark:border-border/30"
              onClick={handleFocalClick}
            >
              <img
                src={effectiveCoverPayload.thumbnail_url}
                alt=""
                className="aspect-video w-full object-cover"
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
            <div className="space-y-1 text-sm text-muted">
              <p>Click on the preview to set where the cover image should be centered.</p>
              <p>
                <span className="font-medium text-text">X: {draft.cover_focal_x}%</span>
                {' · '}
                <span className="font-medium text-text">Y: {draft.cover_focal_y}%</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border/50 bg-surface-1/20 px-4 py-6 text-sm text-muted dark:border-border/30 dark:bg-surface-dark-1/20">
            <ImageOff className="h-5 w-5 shrink-0" />
            <span>Add a cover photo to adjust the focal point</span>
          </div>
        )}
      </section>

      {/* ---- Cover display option ---- */}
      <section>
        <h3 className="mb-3 text-lg font-bold text-text">Cover display</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                className={`flex flex-col gap-3 rounded-2xl border-2 p-4 text-left transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                  isSelected
                    ? 'border-accent bg-accent/5 ring-2 ring-accent/30 dark:bg-accent/10'
                    : 'border-border/40 bg-surface hover:border-border/70 dark:border-border/30 dark:bg-surface-dark-1'
                }`}
                aria-pressed={isSelected}
              >
                <div className="h-20 overflow-hidden rounded-xl bg-linear-to-br from-slate-700 via-slate-600 to-slate-800">
                  {option.renderMock()}
                </div>
                <span
                  className={`text-sm font-semibold ${isSelected ? 'text-accent' : 'text-text'}`}
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
        <h3 className="mb-3 text-lg font-bold text-text">Photo spacing</h3>
        <SegmentedControl<PhotoSpacing>
          label="Photo spacing"
          value={draft.public_photo_spacing}
          options={[
            { value: 'small', label: 'Small', icon: <Minimize2 className="h-4 w-4" /> },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large', icon: <Maximize2 className="h-4 w-4" /> },
          ]}
          onChange={(value) => updateDraft({ public_photo_spacing: value })}
        />
      </section>

      {/* ---- Color scheme ---- */}
      <section>
        <h3 className="mb-3 text-lg font-bold text-text">Color scheme</h3>
        <SegmentedControl<PublicColorScheme>
          label="Color scheme"
          value={draft.public_color_scheme}
          options={[
            {
              value: 'light',
              label: 'Light',
              icon: <Sun className="h-4 w-4" />,
            },
            {
              value: 'dark',
              label: 'Dark',
              icon: <Moon className="h-4 w-4" />,
            },
          ]}
          onChange={(value) => updateDraft({ public_color_scheme: value })}
        />
      </section>

      {/* ---- Live preview ---- */}
      <section>
        <h3 className="mb-3 text-lg font-bold text-text">Preview</h3>
        <div className="overflow-hidden rounded-2xl border border-border/40 dark:border-border/30">
          <PublicGalleryHero
            title={gallery.name}
            date={gallery.shooting_date || undefined}
            cover={effectiveCoverPayload}
            appearance={previewAppearance}
          />
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
      </section>
    </div>
  );
};
