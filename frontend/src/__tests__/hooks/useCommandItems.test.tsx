import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { ProjectListResponse, ShareLinksDashboardResponse } from '../../types';
import { useCommandItems } from '../../hooks/useCommandItems';

vi.mock('../../services/projectService', () => ({
  projectService: { getProjects: vi.fn() },
}));
vi.mock('../../services/shareLinkService', () => ({
  shareLinkService: { getOwnerShareLinks: vi.fn() },
}));

import { projectService } from '../../services/projectService';
import { shareLinkService } from '../../services/shareLinkService';

const getProjects = vi.mocked(projectService.getProjects);
const getOwnerShareLinks = vi.mocked(shareLinkService.getOwnerShareLinks);

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe('useCommandItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty state when disabled', () => {
    const { result } = renderHook(() => useCommandItems({ enabled: false }), { wrapper });

    expect(result.current.projects).toEqual([]);
    expect(result.current.shareLinks).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(getProjects).not.toHaveBeenCalled();
    expect(getOwnerShareLinks).not.toHaveBeenCalled();
  });

  it('fetches and maps projects and share links when enabled', async () => {
    getProjects.mockResolvedValue({
      projects: [
        { id: 'p1', name: 'Anna & Max' },
        { id: 'p2', name: 'Porto Wedding' },
      ],
      total: 2,
      page: 1,
      size: 5,
    } as ProjectListResponse);

    getOwnerShareLinks.mockResolvedValue({
      share_links: [
        {
          id: 's1',
          label: 'Client preview',
          project_name: 'Porto Wedding',
          scope_type: 'project',
        },
      ],
      total: 1,
      page: 1,
      size: 5,
    } as ShareLinksDashboardResponse);

    const { result } = renderHook(() => useCommandItems({ enabled: true }), { wrapper });

    // Immediately: loading should be true
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();

    expect(result.current.projects).toHaveLength(2);
    expect(result.current.projects[0].id).toBe('project:p1');
    expect(result.current.projects[0].label).toBe('Anna & Max');
    expect(result.current.projects[1].id).toBe('project:p2');
    expect(result.current.projects[1].label).toBe('Porto Wedding');

    expect(result.current.shareLinks).toHaveLength(1);
    expect(result.current.shareLinks[0].id).toBe('sharelink:s1');
    expect(result.current.shareLinks[0].label).toBe('Client preview');

    expect(getProjects).toHaveBeenCalledWith(1, 5, {
      sort_by: 'created_at',
      order: 'desc',
    });
    expect(getOwnerShareLinks).toHaveBeenCalledWith(1, 5, undefined, 'active');
  });
  it('preserves the successful source when the other rejects (Promise.allSettled)', async () => {
    getProjects.mockRejectedValue(new Error('projects down'));
    getOwnerShareLinks.mockResolvedValue({
      share_links: [
        { id: 's1', label: 'Client preview', project_name: 'Porto', scope_type: 'project' },
      ],
      total: 1,
      page: 1,
      size: 5,
    } as ShareLinksDashboardResponse);

    const { result } = renderHook(() => useCommandItems({ enabled: true }), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // The failed source leaves projects empty; the successful source still populates.
    expect(result.current.projects).toEqual([]);
    expect(result.current.shareLinks).toHaveLength(1);
    expect(result.current.shareLinks[0].id).toBe('sharelink:s1');
    expect(result.current.error).toBe('Failed to load commands');
  });
});
