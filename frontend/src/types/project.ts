import type { ProjectVisibility, SortOrder } from './gallery';

export type ProjectListSortBy =
  | 'created_at'
  | 'shooting_date'
  | 'name'
  | 'photo_count'
  | 'total_size_bytes';

export interface ProjectListQueryOptions {
  search?: string;
  sort_by?: ProjectListSortBy;
  order?: SortOrder;
}

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  shooting_date: string;
  entry_gallery_id?: string | null;
  entry_gallery_name?: string | null;
  gallery_count: number;
  visible_gallery_count: number;
  has_entry_gallery?: boolean;
  total_photo_count: number;
  total_size_bytes: number;
  has_active_share_links: boolean;
  cover_photo_thumbnail_url: string | null;
}

export interface ProjectGallerySummary {
  id: string;
  owner_id: string;
  project_id: string | null;
  project_name: string | null;
  project_position: number;
  project_visibility: ProjectVisibility;
  name: string;
  created_at: string;
  shooting_date: string;
  cover_photo_id: string | null;
  photo_count: number;
  total_size_bytes: number;
  has_active_share_links: boolean;
  cover_photo_thumbnail_url: string | null;
}

export interface ProjectDetail extends Project {
  galleries: ProjectGallerySummary[];
}

export interface ProjectListResponse {
  projects: Project[];
  total: number;
  page: number;
  size: number;
}

export interface CreateProjectRequest {
  name?: string;
  shooting_date?: string | null;
}

export interface UpdateProjectRequest {
  name?: string;
  shooting_date?: string | null;
}
