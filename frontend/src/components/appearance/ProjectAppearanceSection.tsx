import type { ProjectDetail } from '../../types/project';
import type { GalleryPhoto } from '../../types/photo';
import type { AppearanceDraft } from './constants';
import { AppearanceEditor } from './AppearanceEditor';
import { formatPublicGalleryDate } from './utils';

export interface ProjectAppearanceSectionProps {
  project: ProjectDetail;
  photos: GalleryPhoto[];
  isLoadingPhotos: boolean;
  onLoadCoverPhotos: (opts: { limit: number; offset: number }) => Promise<{
    photos: GalleryPhoto[];
    total: number;
  }>;
  onSaveAppearance: (
    payload: Partial<
      Pick<
        ProjectDetail,
        | 'cover_photo_id'
        | 'cover_focal_x'
        | 'cover_focal_y'
        | 'cover_display_option'
        | 'public_photo_spacing'
        | 'public_color_scheme'
      >
    >,
  ) => Promise<ProjectDetail>;
}

function projectToAppearanceDraft(project: ProjectDetail): AppearanceDraft {
  return {
    cover_photo_id: project.cover_photo_id ?? null,
    cover_focal_x: project.cover_focal_x ?? 50,
    cover_focal_y: project.cover_focal_y ?? 50,
    cover_display_option: project.cover_display_option ?? 'centered_title',
    public_photo_spacing: project.public_photo_spacing ?? 'medium',
    public_color_scheme: project.public_color_scheme ?? 'light',
  };
}

function projectResponseToDraft(project: ProjectDetail): AppearanceDraft {
  return {
    cover_photo_id: project.cover_photo_id ?? null,
    cover_focal_x: project.cover_focal_x ?? 50,
    cover_focal_y: project.cover_focal_y ?? 50,
    cover_display_option: project.cover_display_option ?? 'centered_title',
    public_photo_spacing: project.public_photo_spacing ?? 'medium',
    public_color_scheme: project.public_color_scheme ?? 'light',
  };
}

const PROJECT_INFO_TOOLTIP =
  'These settings and hero photo apply to the entire project share link.';

export const ProjectAppearanceSection = ({
  project,
  photos,
  isLoadingPhotos,
  onLoadCoverPhotos,
  onSaveAppearance,
}: ProjectAppearanceSectionProps) => {
  const handleSaveAppearance = async (
    payload: Partial<AppearanceDraft>,
  ): Promise<AppearanceDraft> => {
    const updated = await onSaveAppearance(payload);
    return projectResponseToDraft(updated);
  };

  return (
    <AppearanceEditor
      appearanceKey={project.id}
      initialDraft={projectToAppearanceDraft(project)}
      photos={photos}
      isLoadingPhotos={isLoadingPhotos}
      onLoadCoverPhotos={onLoadCoverPhotos}
      onSaveAppearance={handleSaveAppearance}
      previewTitle={project.name}
      previewDate={formatPublicGalleryDate(project.shooting_date)}
      infoTooltip={PROJECT_INFO_TOOLTIP}
    />
  );
};
