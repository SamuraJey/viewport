import type { ProjectDetail, ProjectGallerySummary } from '../../types';

export const describeGalleryDragStart = (
  galleries: ProjectGallerySummary[],
  id: string | number,
) => {
  const gallery = galleries.find((entry) => entry.id === String(id));
  const index = galleries.findIndex((entry) => entry.id === String(id));
  const position = index >= 0 ? index + 1 : null;

  return `Picked up ${gallery?.name ?? 'gallery'}${
    position ? `, position ${position} of ${galleries.length}` : ''
  }.`;
};

export const applyProjectGalleryOrder = (
  project: ProjectDetail,
  preferredOrderIds: string[],
): ProjectDetail => {
  const galleryById = new Map(project.galleries.map((gallery) => [gallery.id, gallery]));
  const preferredIds = new Set(preferredOrderIds);
  const orderedGalleries = [
    ...preferredOrderIds
      .map((galleryId) => galleryById.get(galleryId))
      .filter((gallery): gallery is ProjectGallerySummary => Boolean(gallery)),
    ...project.galleries.filter((gallery) => !preferredIds.has(gallery.id)),
  ].map((gallery, index) => ({ ...gallery, project_position: index }));
  const entryGallery = orderedGalleries[0] ?? null;

  return {
    ...project,
    galleries: orderedGalleries,
    entry_gallery_id: entryGallery?.id ?? null,
    entry_gallery_name: entryGallery?.name ?? null,
    has_entry_gallery: entryGallery !== null,
  };
};
