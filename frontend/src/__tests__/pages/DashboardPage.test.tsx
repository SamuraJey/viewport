import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { DashboardPage } from '../../pages/DashboardPage';
import type { Project } from '../../types';

const mockNavigate = vi.fn();

const makeProject = (overrides: Partial<Project>): Project => ({
  id: 'project-1',
  owner_id: 'user-1',
  name: 'Project 1',
  created_at: '2024-01-01T00:00:00Z',
  shooting_date: '2024-01-01',
  entry_gallery_id: 'gallery-1',
  entry_gallery_name: 'Main Gallery',
  gallery_count: 1,
  listed_gallery_count: 1,
  has_entry_gallery: true,
  folder_count: 1,
  listed_folder_count: 1,
  total_photo_count: 12,
  total_size_bytes: 0,
  has_active_share_links: false,
  recent_folder_thumbnail_urls: [],
  ...overrides,
});

const mockProjects: Project[] = [
  makeProject({
    id: 'project-1',
    name: 'Wedding Weekend',
    entry_gallery_id: 'gallery-1',
    entry_gallery_name: 'Photos',
    gallery_count: 2,
    listed_gallery_count: 2,
    folder_count: 2,
    listed_folder_count: 2,
    total_photo_count: 20,
  }),
];

vi.mock('../../services/projectService', () => ({
  projectService: {
    getProjects: vi.fn(),
    createProject: vi.fn(),
    getProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    createProjectFolder: vi.fn(),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const DashboardPageWrapper = ({ initialPath = '/dashboard' }: { initialPath?: string }) => (
  <MemoryRouter initialEntries={[initialPath]}>
    <DashboardPage />
  </MemoryRouter>
);

describe('DashboardPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    const { projectService } = await import('../../services/projectService');
    vi.mocked(projectService.getProjects).mockResolvedValue({
      projects: mockProjects,
      total: mockProjects.length,
      page: 1,
      size: 18,
    });
  });

  it('renders a project-only dashboard with one create flow', async () => {
    render(<DashboardPageWrapper />);

    await screen.findByText('Wedding Weekend');

    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.queryByText('Standalone galleries')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create new project' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create new gallery' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search projects')).toBeInTheDocument();
    expect(screen.queryByText('Single-gallery project')).not.toBeInTheDocument();
    expect(screen.getByText(/starts with Photos/i)).toBeInTheDocument();
  });

  it('fetches projects using the project-only pagination defaults', async () => {
    const { projectService } = await import('../../services/projectService');

    render(<DashboardPageWrapper />);

    await waitFor(() => {
      expect(projectService.getProjects).toHaveBeenCalledWith(1, 18, undefined);
    });
  });

  it('requests project search from query params', async () => {
    const { projectService } = await import('../../services/projectService');

    render(<DashboardPageWrapper initialPath="/dashboard?search=weekend" />);

    await waitFor(() => {
      expect(projectService.getProjects).toHaveBeenCalledWith(1, 18, 'weekend');
    });
  });

  it('updates project search and resets pagination without dropping the search query', async () => {
    const user = userEvent.setup();
    const { projectService } = await import('../../services/projectService');

    render(<DashboardPageWrapper initialPath="/dashboard?page=3" />);

    await waitFor(() => {
      expect(projectService.getProjects).toHaveBeenCalledWith(3, 18, undefined);
    });

    await user.clear(screen.getByLabelText('Search projects'));
    await user.type(screen.getByLabelText('Search projects'), 'client');

    await waitFor(
      () => {
        expect(projectService.getProjects).toHaveBeenLastCalledWith(1, 18, 'client');
      },
      { timeout: 1500 },
    );
  });

  it('debounces project search before resetting pagination and requesting filtered results', async () => {
    const { projectService } = await import('../../services/projectService');

    render(<DashboardPageWrapper initialPath="/dashboard?page=3" />);

    await waitFor(() => {
      expect(projectService.getProjects).toHaveBeenCalledWith(3, 18, undefined);
    });

    vi.useFakeTimers();

    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const searchInput = screen.getByLabelText('Search projects');

      await user.clear(searchInput);
      await user.type(searchInput, 'client');

      expect(projectService.getProjects).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(299);

      expect(projectService.getProjects).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);

      expect(projectService.getProjects).toHaveBeenLastCalledWith(1, 18, 'client');
    } finally {
      await vi.runOnlyPendingTimersAsync();
      vi.useRealTimers();
    }
  });

  it('creates a project and navigates to the project gallery list', async () => {
    const user = userEvent.setup();
    const { projectService } = await import('../../services/projectService');

    vi.mocked(projectService.createProject).mockResolvedValue(
      makeProject({
        id: 'project-2',
        name: 'Client Delivery',
        entry_gallery_id: 'gallery-2',
        entry_gallery_name: 'Client Delivery',
      }),
    );

    render(<DashboardPageWrapper />);

    await screen.findByText('Wedding Weekend');
    await user.click(screen.getByRole('button', { name: 'Create new project' }));
    await user.type(screen.getByPlaceholderText('Project name'), 'Client Delivery');
    await user.click(screen.getByRole('button', { name: 'Create Project' }));

    await waitFor(() => {
      expect(projectService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Client Delivery' }),
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith('/projects/project-2');
  });

  it('shows a project-first empty state when there are no projects', async () => {
    const { projectService } = await import('../../services/projectService');
    vi.mocked(projectService.getProjects).mockResolvedValue({
      projects: [],
      total: 0,
      page: 1,
      size: 18,
    });

    render(<DashboardPageWrapper />);

    await waitFor(() => {
      expect(screen.getByText('No projects yet')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Create a project to start uploading photos into its first gallery right away.',
        ),
      ).toBeInTheDocument();
    });
  });
});
