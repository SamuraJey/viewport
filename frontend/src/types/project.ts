import type { ProjectVisibility } from './gallery';

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  shooting_date: string;
  entry_gallery_id?: string | null;
  entry_gallery_name?: string | null;
  gallery_count?: number;
  listed_gallery_count?: number;
  has_entry_gallery?: boolean;
  folder_count: number;
  listed_folder_count: number;
  total_photo_count: number;
  total_size_bytes: number;
  has_active_share_links: boolean;
  recent_folder_thumbnail_urls: string[];
}

export interface ProjectFolderSummary {
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
  recent_photo_thumbnail_urls: string[];
}

export interface ProjectDetail extends Project {
  folders: ProjectFolderSummary[];
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
  initial_gallery_name?: string | null;
}

export interface UpdateProjectRequest {
  name?: string;
  shooting_date?: string | null;
}
