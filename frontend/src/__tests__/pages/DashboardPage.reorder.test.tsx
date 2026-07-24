import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';

import { DashboardPage } from '../../pages/DashboardPage';
import type { Project } from '../../types';

const makeProject = (id: string, name: string, manualOrder: number): Project => ({
  id,
  owner_id: 'user-1',
  name,
  created_at: '2026-07-24T00:00:00Z',
  shooting_date: '2026-07-24',
  manual_order: manualOrder,
  entry_gallery_id: null,
  entry_gallery_name: null,
  gallery_count: 0,
  visible_gallery_count: 0,
  has_entry_gallery: false,
  total_photo_count: 0,
  total_size_bytes: 0,
  has_active_share_links: false,
  active_share_link_count: 0,
  latest_share_link_id: null,
  active_viewers_count: 0,
  last_activity_at: null,
  cover_photo_thumbnail_url: null,
  preview_thumbnail_urls: [],
  cover_photo_id: null,
  cover_focal_x: 50,
  cover_focal_y: 50,
  cover_display_option: 'centered_title',
  public_photo_spacing: 'medium',
  public_color_scheme: 'light',
});

const initialProjects = [
  makeProject('project-1', 'Original Delivery', 0),
  makeProject('project-2', 'Second Delivery', 1),
];

vi.mock('../../services/projectService', () => ({
  projectService: {
    getProjects: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    reorderProjects: vi.fn(),
  },
}));

vi.mock('../../services/shareLinkService', () => ({
  shareLinkService: {
    createProjectShareLink: vi.fn(),
  },
}));

vi.mock('../../components/dashboard/SortableProjectGrid', () => ({
  SortableProjectGrid: ({
    projects,
    onReorder,
  }: {
    projects: Project[];
    onReorder: (projects: Project[]) => void;
  }) => (
    <div>
      {projects.map((project) => (
        <span key={project.id}>{project.name}</span>
      ))}
      <button type="button" onClick={() => onReorder([...projects].reverse())}>
        Trigger project reorder
      </button>
    </div>
  ),
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
};

describe('DashboardPage reorder recovery', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { projectService } = await import('../../services/projectService');
    vi.mocked(projectService.getProjects).mockResolvedValue({
      projects: initialProjects,
      total: initialProjects.length,
      page: 1,
      size: 18,
    });
  });

  it('refreshes the latest query instead of restoring stale projects after failure', async () => {
    const { projectService } = await import('../../services/projectService');
    const filteredProject = makeProject('project-filtered', 'Filtered Delivery', 0);
    let rejectReorder!: (reason: Error) => void;
    const pendingReorder = new Promise<void>((_, reject) => {
      rejectReorder = reject;
    });

    vi.mocked(projectService.getProjects)
      .mockResolvedValueOnce({
        projects: initialProjects,
        total: initialProjects.length,
        page: 1,
        size: 18,
      })
      .mockResolvedValue({
        projects: [filteredProject],
        total: 1,
        page: 1,
        size: 18,
      });
    vi.mocked(projectService.reorderProjects).mockReturnValue(pendingReorder);

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <DashboardPage />
        <LocationProbe />
      </MemoryRouter>,
    );

    await screen.findByText('Original Delivery');
    fireEvent.click(screen.getByRole('button', { name: 'Trigger project reorder' }));
    await waitFor(() => {
      expect(projectService.reorderProjects).toHaveBeenCalledWith(['project-2', 'project-1']);
    });

    fireEvent.change(screen.getByLabelText('Search projects'), {
      target: { value: 'filtered' },
    });
    await waitFor(
      () => {
        expect(screen.getByTestId('location')).toHaveTextContent('/dashboard?search=filtered');
      },
      { timeout: 1500 },
    );

    await act(async () => {
      rejectReorder(new Error('Reorder failed'));
      await pendingReorder.catch(() => undefined);
    });

    expect(await screen.findByText('Filtered Delivery')).toBeInTheDocument();
    expect(screen.queryByText('Original Delivery')).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading projects' })).not.toBeInTheDocument();
    expect(projectService.getProjects).toHaveBeenLastCalledWith(1, 18, {
      search: 'filtered',
      sort_by: 'manual_order',
      order: 'asc',
    });
    expect(
      screen.getByText('Project order could not be saved. The latest project list was reloaded.'),
    ).toBeInTheDocument();
  });
});
