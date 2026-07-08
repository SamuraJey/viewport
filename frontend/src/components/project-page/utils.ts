import type { ProjectDetail, ProjectGallerySummary, Gallery } from '../../types';
import type { GalleryDraft } from './types';

export const toDateInputValue = (value?: string | null) =>
  value?.slice(0, 10) || new Date().toISOString().slice(0, 10);

export const buildGalleryDraft = (project?: ProjectDetail | null): GalleryDraft => ({
  name: '',
  shooting_date: toDateInputValue(project?.shooting_date),
  project_visibility: 'listed',
});

export const toProjectGalleryCard = (folder: ProjectGallerySummary): Gallery => ({
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
  cover_focal_x: 50,
  cover_focal_y: 50,
  cover_display_option: 'centered_title',
  public_photo_spacing: 'medium',
  public_color_scheme: 'light',
});
