import type { PublicGalleryAppearance } from '../../types/sharelink';
import type { PhotoSpacing } from '../../types/gallery';

export const DEFAULT_PUBLIC_GALLERY_APPEARANCE: PublicGalleryAppearance = {
  cover_focal_x: 50,
  cover_focal_y: 50,
  cover_display_option: 'centered_title',
  photo_spacing: 'medium',
  color_scheme: 'light',
};

export const normalizePublicGalleryAppearance = (
  partial: Partial<PublicGalleryAppearance> | undefined | null,
): PublicGalleryAppearance => ({
  cover_focal_x: partial?.cover_focal_x ?? DEFAULT_PUBLIC_GALLERY_APPEARANCE.cover_focal_x,
  cover_focal_y: partial?.cover_focal_y ?? DEFAULT_PUBLIC_GALLERY_APPEARANCE.cover_focal_y,
  cover_display_option:
    partial?.cover_display_option ?? DEFAULT_PUBLIC_GALLERY_APPEARANCE.cover_display_option,
  photo_spacing: partial?.photo_spacing ?? DEFAULT_PUBLIC_GALLERY_APPEARANCE.photo_spacing,
  color_scheme: partial?.color_scheme ?? DEFAULT_PUBLIC_GALLERY_APPEARANCE.color_scheme,
});

export const toHeroObjectPosition = (appearance: PublicGalleryAppearance): string =>
  `${appearance.cover_focal_x}% ${appearance.cover_focal_y}%`;

export const getPublicGalleryThemeClassName = (appearance: PublicGalleryAppearance): string =>
  appearance.color_scheme === 'dark' ? 'pg-theme-dark' : 'pg-theme-light';

export const getPublicGallerySpacingClassName = (spacing: PhotoSpacing): string => {
  switch (spacing) {
    case 'small':
      return 'pg-spacing-small';
    case 'large':
      return 'pg-spacing-large';
    default:
      return 'pg-spacing-medium';
  }
};
