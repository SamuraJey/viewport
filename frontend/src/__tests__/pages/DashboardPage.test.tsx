import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

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
  visible_gallery_count: 1,
  has_entry_gallery: true,
  total_photo_count: 12,
  total_size_bytes: 0,
  has_active_share_links: false,
  cover_photo_thumbnail_url: null,
  ...overrides,
});

const mockProjects: Project[] = [
  makeProject({
    id: 'project-1',
    name: 'Wedding Weekend',
    entry_gallery_id: 'gallery-1',
    entry_gallery_name: 'Photos',
    gallery_count: 2,
    visible_gallery_count: 2,
    total_photo_count: 20,
  }),
  makeProject({
    id: 'project-2',
    name: 'A Very Long Editorial Project Title That Still Needs To Fit Cleanly On The Card',
    entry_gallery_id: 'gallery-2',
    entry_gallery_name: 'Preview Gallery',
    gallery_count: 1,
    visible_gallery_count: 1,
    total_photo_count: 8,
    has_active_share_links: true,
    cover_photo_thumbnail_url: 'https://example.com/cover.jpg',
  }),
];

vi.mock('../../services/projectService', () => ({
  projectService: {
    getProjects: vi.fn(),
    createProject: vi.fn(),
    getProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    createProjectGallery: vi.fn(),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
};

const fillInput = (input: HTMLElement, value: string) => {
  fireEvent.change(input, { target: { value } });
};

const DashboardPageWrapper = ({ initialPath = '/dashboard' }: { initialPath?: string }) => (
  <MemoryRouter initialEntries={[initialPath]}>
    <DashboardPage />
    <LocationProbe />
  </MemoryRouter>
);

describe('DashboardPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockNavigate.mockReset();

    const { projectService } = await import('../../services/projectService');
    vi.mocked(projectService.getProjects).mockResolvedValue({
      projects: mockProjects,
      total: mockProjects.length,
      page: 1,
      size: 18,
    });
    vi.mocked(projectService.deleteProject).mockResolvedValue(undefined);
  });

  it('renders the approved dashboard hierarchy and card content model', async () => {
    render(<DashboardPageWrapper />);

    await screen.findByText('Wedding Weekend');

    expect(screen.getAllByRole('heading', { level: 1, name: 'Projects' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Create new project' })).toHaveLength(1);
    expect(screen.getByLabelText('Search projects')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search projects...')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort projects')).toHaveTextContent('Date created (new to old)');
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Project library' }),
    ).not.toBeInTheDocument();

    expect(screen.getByText('2 galleries • 20 photos • 0 Bytes')).toBeInTheDocument();
    expect(screen.getByText('1 gallery • 8 photos • 0 Bytes')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'A Very Long Editorial Project Title That Still Needs To Fit Cleanly On The Card',
      }),
    ).toHaveClass('wrap-anywhere', 'whitespace-normal');
    expect(screen.getByRole('link', { name: /Wedding Weekend/ })).toHaveAttribute(
      'href',
      '/projects/project-1',
    );
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getAllByText(/20 photos/i).length).toBeGreaterThan(0);

    expect(screen.queryByText(/^PROJECT$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/starts with/i)).not.toBeInTheDocument();
    expect(screen.queryByText('No share link')).not.toBeInTheDocument();
    expect(screen.queryByText('Single-gallery project')).not.toBeInTheDocument();
    expect(screen.queryByText('Multi-gallery project')).not.toBeInTheDocument();
  });

  it('fetches projects using the project-only pagination defaults', async () => {
    const { projectService } = await import('../../services/projectService');

    render(<DashboardPageWrapper />);

    await waitFor(() => {
      expect(projectService.getProjects).toHaveBeenCalledWith(1, 18, {
        search: undefined,
        sort_by: 'created_at',
        order: 'desc',
      });
    });
  });

  it('requests project search from query params', async () => {
    const { projectService } = await import('../../services/projectService');

    render(<DashboardPageWrapper initialPath="/dashboard?search=weekend" />);

    await waitFor(() => {
      expect(projectService.getProjects).toHaveBeenCalledWith(1, 18, {
        search: 'weekend',
        sort_by: 'created_at',
        order: 'desc',
      });
    });
  });

  it('initializes project sorting from query params', async () => {
    const { projectService } = await import('../../services/projectService');

    render(<DashboardPageWrapper initialPath="/dashboard?sort_by=photo_count&order=asc" />);

    await waitFor(() => {
      expect(projectService.getProjects).toHaveBeenCalledWith(1, 18, {
        search: undefined,
        sort_by: 'photo_count',
        order: 'asc',
      });
    });
    expect(screen.getByLabelText('Sort projects')).toHaveTextContent('Photo count (low to high)');
  });

  it('updates project sorting in the URL and resets pagination', async () => {
    const user = userEvent.setup();
    const { projectService } = await import('../../services/projectService');

    render(<DashboardPageWrapper initialPath="/dashboard?page=3" />);

    await waitFor(() => {
      expect(projectService.getProjects).toHaveBeenCalledWith(3, 18, {
        search: undefined,
        sort_by: 'created_at',
        order: 'desc',
      });
    });

    await user.click(screen.getByLabelText('Sort projects'));
    fireEvent.click(
      within(await screen.findByRole('listbox')).getByRole('option', {
        name: 'Photo count (high to low)',
      }),
    );

    await waitFor(() => {
      expect(projectService.getProjects).toHaveBeenLastCalledWith(1, 18, {
        search: undefined,
        sort_by: 'photo_count',
        order: 'desc',
      });
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard?sort_by=photo_count');

    await user.click(screen.getByLabelText('Sort projects'));
    fireEvent.click(
      within(await screen.findByRole('listbox')).getByRole('option', {
        name: 'Photo count (low to high)',
      }),
    );

    await waitFor(() => {
      expect(projectService.getProjects).toHaveBeenLastCalledWith(1, 18, {
        search: undefined,
        sort_by: 'photo_count',
        order: 'asc',
      });
    });
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/dashboard?sort_by=photo_count&order=asc',
    );
  });

  it('updates project search and resets pagination without dropping the search query', async () => {
    const { projectService } = await import('../../services/projectService');

    render(<DashboardPageWrapper initialPath="/dashboard?page=3" />);

    await waitFor(() => {
      expect(projectService.getProjects).toHaveBeenCalledWith(3, 18, {
        search: undefined,
        sort_by: 'created_at',
        order: 'desc',
      });
    });

    fillInput(screen.getByLabelText('Search projects'), 'client');

    await waitFor(
      () => {
        expect(projectService.getProjects).toHaveBeenLastCalledWith(1, 18, {
          search: 'client',
          sort_by: 'created_at',
          order: 'desc',
        });
      },
      { timeout: 1500 },
    );

    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard?search=client');
  });

  it('debounces project search before requesting filtered results', async () => {
    const { projectService } = await import('../../services/projectService');

    render(<DashboardPageWrapper initialPath="/dashboard?page=3" />);

    await waitFor(() => {
      expect(projectService.getProjects).toHaveBeenCalledWith(3, 18, {
        search: undefined,
        sort_by: 'created_at',
        order: 'desc',
      });
    });

    vi.useFakeTimers();

    try {
      const searchInput = screen.getByLabelText('Search projects');

      await act(async () => {
        fireEvent.change(searchInput, { target: { value: '' } });
        fireEvent.change(searchInput, { target: { value: 'client' } });
      });

      expect(projectService.getProjects).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(299);
      });

      expect(projectService.getProjects).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(projectService.getProjects).toHaveBeenLastCalledWith(1, 18, {
        search: 'client',
        sort_by: 'created_at',
        order: 'desc',
      });
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
        id: 'project-3',
        name: 'Client Delivery',
        entry_gallery_id: null,
        entry_gallery_name: null,
        has_entry_gallery: false,
        gallery_count: 0,
        visible_gallery_count: 0,
      }),
    );

    render(<DashboardPageWrapper />);

    await screen.findByText('Wedding Weekend');
    await user.click(screen.getByRole('button', { name: 'Create new project' }));
    fillInput(screen.getByPlaceholderText('Project name'), 'Client Delivery');
    await user.click(screen.getByRole('button', { name: 'Create Project' }));

    await waitFor(() => {
      expect(projectService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Client Delivery' }),
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith('/projects/project-3');
  });

  it('navigates to a created project without waiting for dashboard refresh', async () => {
    const user = userEvent.setup();
    const { projectService } = await import('../../services/projectService');
    const pendingRefresh = new Promise<never>(() => {});

    vi.mocked(projectService.getProjects)
      .mockResolvedValueOnce({
        projects: mockProjects,
        total: mockProjects.length,
        page: 1,
        size: 18,
      })
      .mockReturnValueOnce(pendingRefresh);
    vi.mocked(projectService.createProject).mockResolvedValue(
      makeProject({
        id: 'project-3',
        name: 'Client Delivery',
        entry_gallery_id: null,
        entry_gallery_name: null,
        has_entry_gallery: false,
        gallery_count: 0,
        visible_gallery_count: 0,
      }),
    );

    render(<DashboardPageWrapper />);

    await screen.findByText('Wedding Weekend');
    await user.click(screen.getByRole('button', { name: 'Create new project' }));
    fillInput(screen.getByPlaceholderText('Project name'), 'Client Delivery');
    await user.click(screen.getByRole('button', { name: 'Create Project' }));

    await waitFor(() => {
      expect(projectService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Client Delivery' }),
      );
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/projects/project-3');
    });
  });

  it('deletes a project from the dashboard using the shared confirmation flow', async () => {
    const user = userEvent.setup();
    const { projectService } = await import('../../services/projectService');

    render(<DashboardPageWrapper />);

    await screen.findByText('Wedding Weekend');
    await user.click(screen.getByLabelText('Delete project Wedding Weekend'));

    const deleteDialog = await screen.findByRole('dialog', { name: /delete project/i });
    expect(
      within(deleteDialog).getByText(/delete "Wedding Weekend" and all of its galleries/i),
    ).toBeInTheDocument();

    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(projectService.deleteProject).toHaveBeenCalledWith('project-1');
    });
    await waitFor(() => {
      expect(projectService.getProjects).toHaveBeenCalledTimes(2);
    });
  });

  it('moves to the previous valid page after deleting the only project on the last page', async () => {
    const user = userEvent.setup();
    const { projectService } = await import('../../services/projectService');
    const lastPageProject = makeProject({
      id: 'project-37',
      name: 'Last Project',
      entry_gallery_id: null,
      entry_gallery_name: null,
    });

    vi.mocked(projectService.getProjects)
      .mockResolvedValueOnce({
        projects: [lastPageProject],
        total: 37,
        page: 3,
        size: 18,
      })
      .mockResolvedValueOnce({
        projects: mockProjects,
        total: 36,
        page: 2,
        size: 18,
      });

    render(<DashboardPageWrapper initialPath="/dashboard?page=3" />);

    await screen.findByText('Last Project');
    await user.click(screen.getByLabelText('Delete project Last Project'));
    await user.click(
      within(await screen.findByRole('dialog', { name: /delete project/i })).getByRole('button', {
        name: 'Delete',
      }),
    );

    await waitFor(() => {
      expect(projectService.deleteProject).toHaveBeenCalledWith('project-37');
    });
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/dashboard?page=2');
    });
    await waitFor(() => {
      expect(projectService.getProjects).toHaveBeenLastCalledWith(2, 18, {
        search: undefined,
        sort_by: 'created_at',
        order: 'desc',
      });
    });
    expect(
      screen.queryByRole('heading', { level: 2, name: 'No projects yet' }),
    ).not.toBeInTheDocument();
  });

  it('shows the approved empty state copy and dedicated CTA', async () => {
    const { projectService } = await import('../../services/projectService');
    vi.mocked(projectService.getProjects).mockResolvedValue({
      projects: [],
      total: 0,
      page: 1,
      size: 18,
    });

    render(<DashboardPageWrapper />);

    const emptyHeading = await screen.findByRole('heading', {
      level: 2,
      name: 'No projects yet',
    });
    const emptyState = emptyHeading.closest('div');

    expect(
      screen.getByText(
        'Create your first project to upload photos, organize galleries, and share polished deliveries with clients.',
      ),
    ).toBeInTheDocument();

    expect(
      within(emptyState as HTMLElement).getByRole('button', { name: 'Create your first project' }),
    ).toBeInTheDocument();
  });
});
