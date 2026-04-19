import { api } from '../lib/api';
import { isDemoModeEnabled } from '../lib/demoMode';
import { getDemoService } from './demoService';
import type {
  CreateProjectRequest,
  Project,
  ProjectDetail,
  ProjectListResponse,
  UpdateProjectRequest,
} from '../types';

const getProjects = async (page = 1, size = 10, search?: string): Promise<ProjectListResponse> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getProjects(page, size, search);
  }

  const params = new URLSearchParams({
    page: page.toString(),
    size: size.toString(),
  });
  if (search?.trim()) {
    params.set('search', search.trim());
  }

  const response = await api.get<ProjectListResponse>(`/projects?${params.toString()}`);
  return response.data;
};

const getProject = async (projectId: string): Promise<ProjectDetail> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getProject(projectId);
  }
  const response = await api.get<ProjectDetail>(`/projects/${projectId}`);
  return response.data;
};

const createProject = async (payload: CreateProjectRequest): Promise<Project> => {
  if (isDemoModeEnabled()) {
    return getDemoService().createProject(payload);
  }
  const response = await api.post<Project>('/projects', payload ?? {});
  return response.data;
};

const updateProject = async (
  projectId: string,
  payload: UpdateProjectRequest,
): Promise<Project> => {
  if (isDemoModeEnabled()) {
    return getDemoService().updateProject(projectId, payload);
  }
  const response = await api.patch<Project>(`/projects/${projectId}`, payload);
  return response.data;
};

const deleteProject = async (projectId: string): Promise<void> => {
  if (isDemoModeEnabled()) {
    await getDemoService().deleteProject(projectId);
    return;
  }
  await api.delete(`/projects/${projectId}`);
};

const createProjectFolder = async (
  projectId: string,
  payload: {
    name?: string;
    shooting_date?: string | null;
    public_sort_by?: 'uploaded_at' | 'original_filename' | 'file_size';
    public_sort_order?: 'asc' | 'desc';
    project_position?: number;
    project_visibility?: 'listed' | 'direct_only';
  },
) => {
  if (isDemoModeEnabled()) {
    return getDemoService().createProjectFolder(projectId, payload);
  }
  const response = await api.post(`/projects/${projectId}/galleries`, payload ?? {});
  return response.data;
};

export const projectService = {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  createProjectFolder,
};
