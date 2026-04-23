import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectService } from '../../services/projectService';
import { api } from '../../lib/api';
import { isDemoModeEnabled } from '../../lib/demoMode';
import { getDemoService } from '../../services/demoService';

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('../../lib/demoMode', () => ({
  isDemoModeEnabled: vi.fn(),
}));

vi.mock('../../services/demoService', () => ({
  getDemoService: vi.fn(),
}));

describe('projectService', () => {
  const mockResponse = {
    data: {
      projects: [],
      total: 0,
      page: 1,
      size: 10,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isDemoModeEnabled).mockReturnValue(false);
    vi.mocked(api.get).mockResolvedValue(mockResponse);
  });

  it('serializes default project list pagination', async () => {
    const result = await projectService.getProjects();

    expect(api.get).toHaveBeenCalledWith('/projects?page=1&size=10');
    expect(result).toEqual(mockResponse.data);
  });

  it('trims search and serializes sort options', async () => {
    await projectService.getProjects(2, 18, {
      search: '  client  ',
      sort_by: 'photo_count',
      order: 'asc',
    });

    expect(api.get).toHaveBeenCalledWith(
      '/projects?page=2&size=18&search=client&sort_by=photo_count&order=asc',
    );
  });

  it('preserves the backward-compatible search string signature', async () => {
    await projectService.getProjects(1, 18, '  wedding  ');

    expect(api.get).toHaveBeenCalledWith('/projects?page=1&size=18&search=wedding');
  });

  it('passes normalized options through in demo mode', async () => {
    const demoResponse = { projects: [], total: 0, page: 1, size: 18 };
    const demoService = {
      getProjects: vi.fn().mockResolvedValue(demoResponse),
    };
    vi.mocked(isDemoModeEnabled).mockReturnValue(true);
    vi.mocked(getDemoService).mockReturnValue(demoService as never);

    const result = await projectService.getProjects(1, 18, {
      search: 'client',
      sort_by: 'total_size_bytes',
      order: 'desc',
    });

    expect(result).toEqual(demoResponse);
    expect(api.get).not.toHaveBeenCalled();
    expect(demoService.getProjects).toHaveBeenCalledWith(1, 18, {
      search: 'client',
      sort_by: 'total_size_bytes',
      order: 'desc',
    });
  });
});
