import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ImageOff, Loader2, Maximize2, Minimize2, Moon, Sun } from 'lucide-react';
import type { GalleryPhoto } from '../../types/photo';
import type {
  CoverDisplayOption,
  GalleryDetail,
  PhotoSpacing,
  PublicColorScheme,
} from '../../types/gallery';
import type { PublicPhoto } from '../../types/sharelink';
import {
  getPublicGallerySpacingClassName,
  normalizePublicGalleryAppearance,
  toHeroObjectPosition,
} from '../public-gallery/galleryAppearance';
import { PublicGalleryHero } from '../public-gallery/PublicGalleryHero';
import { PublicGalleryPhotoSection } from '../public-gallery/PublicGalleryPhotoSection';

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
  const prevGalleryIdRef = useRef(gallery.id);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDraftRef = useRef<AppearanceDraft>(draft);
  const previewGridRef = useRef<HTMLDivElement | null>(null);
  const previewObserverRef = useRef<HTMLDivElement | null>(null);

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
      lastSavedDraftRef.current = next;
      setSaveStatus('idle');
    }
  }, [
    gallery.id,
    gallery.cover_photo_id,
    gallery.cover_focal_x,
    gallery.cover_focal_y,
    gallery.cover_display_option,
    gallery.public_photo_spacing,
    gallery.public_color_scheme,
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

  // -- effective cover ------------------------------------------------------
  const effectiveCover = draft.cover_photo_id
    ? (photos.find((p) => p.id === draft.cover_photo_id) ?? null)
    : (photos[0] ?? null);

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
          <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
            {photos.map((photo) => {
              const isSelected = draft.cover_photo_id === photo.id;
              const isFallback = draft.cover_photo_id === null && photos[0]?.id === photo.id;

              return (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => updateDraft({ cover_photo_id: photo.id })}
                  className={`relative overflow-hidden rounded-xl border-2 transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                    isSelected
                      ? 'border-accent ring-2 ring-accent/40'
                      : 'border-transparent hover:border-border/60'
                  }`}
                  aria-pressed={isSelected}
                  aria-label={
                    photo.filename ? `Select ${photo.filename} as cover` : 'Select as cover'
                  }
                >
                  <img
                    src={photo.thumbnail_url}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-black/50 px-1.5 py-0.5">
                    <p
                      className="truncate text-[10px] font-medium text-white/90"
                      title={photo.filename}
                    >
                      {photo.filename}
                    </p>
                  </div>
                  {isFallback && (
                    <span className="absolute left-1 top-1 rounded bg-amber-500/90 px-1 py-0.5 text-[9px] font-bold text-white">
                      Fallback
                    </span>
                  )}
                  {isSelected && (
                    <span className="absolute right-1 top-1 rounded bg-accent px-1 py-0.5 text-[9px] font-bold text-accent-foreground">
                      Cover
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
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
