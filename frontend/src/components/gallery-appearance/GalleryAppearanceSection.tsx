import { useAuthStore } from '../../stores/authStore';
import type { GalleryDetail } from '../../types/gallery';
import type { GalleryPhoto } from '../../types/photo';
import type { AppearanceDraft } from '../appearance/constants';
import { AppearanceEditor } from '../appearance/AppearanceEditor';
import { formatPublicGalleryDate } from '../appearance/utils';

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

function galleryToAppearanceDraft(gallery: GalleryDetail): AppearanceDraft {
  return {
    cover_photo_id: gallery.cover_photo_id ?? null,
    cover_focal_x: gallery.cover_focal_x ?? 50,
    cover_focal_y: gallery.cover_focal_y ?? 50,
    cover_display_option: gallery.cover_display_option ?? 'centered_title',
    public_photo_spacing: gallery.public_photo_spacing ?? 'medium',
    public_color_scheme: gallery.public_color_scheme ?? 'light',
  };
}

const GALLERY_INFO_TOOLTIP =
  'These settings apply only when sharing this gallery with its own direct link. Inside a project share, the project Appearance is used instead.';

export const GalleryAppearanceSection = ({
  gallery,
  photos,
  isLoadingPhotos,
  onLoadCoverPhotos,
  onSaveAppearance,
}: GalleryAppearanceSectionProps) => {
  const currentUser = useAuthStore((state) => state.user);
  const handleSaveAppearance = async (
    payload: Partial<AppearanceDraft>,
  ): Promise<AppearanceDraft> => {
    const updated = await onSaveAppearance(payload);
    return galleryToAppearanceDraft(updated);
  };

  return (
    <AppearanceEditor
      appearanceKey={gallery.id}
      initialDraft={galleryToAppearanceDraft(gallery)}
      photos={photos}
      isLoadingPhotos={isLoadingPhotos}
      onLoadCoverPhotos={onLoadCoverPhotos}
      onSaveAppearance={handleSaveAppearance}
      previewTitle={gallery.name}
      previewDate={formatPublicGalleryDate(gallery.shooting_date)}
      previewPhotographer={currentUser?.display_name ?? undefined}
      infoTooltip={GALLERY_INFO_TOOLTIP}
    />
  );
};
