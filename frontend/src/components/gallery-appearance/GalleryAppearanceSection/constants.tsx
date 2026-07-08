import type { ReactNode } from 'react';
import type {
  CoverDisplayOption,
  GalleryDetail,
  PhotoSpacing,
  PublicColorScheme,
} from '../../../types/gallery';
import type { GalleryPhoto } from '../../../types/photo';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export const SAVE_STATUS_LABELS: Record<SaveStatus, string> = {
  idle: '',
  dirty: 'Unsaved changes',
  saving: 'Saving changes…',
  saved: 'All changes saved',
  error: 'Could not save appearance. Your preview still shows unsaved changes.',
};

export const AUTOSAVE_DEBOUNCE_MS = 450;
export const MAX_PREVIEW_PHOTOS = 12;
export const COVER_PICKER_PAGE_SIZE = 100;

export interface AppearanceDraft {
  cover_photo_id: string | null;
  cover_focal_x: number;
  cover_focal_y: number;
  cover_display_option: CoverDisplayOption;
  public_photo_spacing: PhotoSpacing;
  public_color_scheme: PublicColorScheme;
}

export interface GalleryAppearanceSectionProps {
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

export const DISPLAY_OPTION_CONFIG: {
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
