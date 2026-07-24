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
  manual_order: 0,
  entry_gallery_id: 'gallery-1',
  entry_gallery_name: 'Main Gallery',
  gallery_count: 1,
  visible_gallery_count: 1,
  has_entry_gallery: true,
  total_photo_count: 12,
  total_size_bytes: 0,
  has_active_share_links: false,
  active_share_link_count: 0,
  latest_share_link_id: null,
  active_viewers_count: 0,
  last_activity_at: '2024-01-01T00:00:00Z',
  cover_photo_thumbnail_url: null,
  preview_thumbnail_urls: [],
  cover_photo_id: null,
  cover_focal_x: 50,
  cover_focal_y: 50,
  cover_display_option: 'centered_title',
  public_photo_spacing: 'medium',
  public_color_scheme: 'light',
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
    active_share_link_count: 2,
    latest_share_link_id: 'share-2',
    active_viewers_count: 3,
    cover_photo_thumbnail_url: 'https://example.com/cover.jpg',
    preview_thumbnail_urls: [
      'https://example.com/preview-1.jpg',
      'https://example.com/preview-2.jpg',
      'https://example.com/preview-3.jpg',
      'https://example.com/preview-4.jpg',
    ],
  }),
];

vi.mock('../../services/projectService', () => ({
  projectService: {
    getProjects: vi.fn(),
    createProject: vi.fn(),
    getProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    reorderProjects: vi.fn(),
    createProjectGallery: vi.fn(),
  },
}));

vi.mock('../../services/shareLinkService', () => ({
  shareLinkService: {
    createProjectShareLink: vi.fn(),
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
    vi.mocked(projectService.getProjects).mockReset();
    vi.mocked(projectService.createProject).mockReset();
    vi.mocked(projectService.updateProject).mockReset();
    vi.mocked(projectService.deleteProject).mockReset();
    vi.mocked(projectService.reorderProjects).mockReset();
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
    expect(screen.getAllByRole('button', { name: 'New project' })).toHaveLength(1);
    expect(screen.getByLabelText('Search projects')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search projects')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort projects')).toHaveTextContent('Manual order');
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Project library' }),
    ).not.toBeInTheDocument();

    expect(screen.getByRole('article', { name: /Wedding Weekend.*20 photos/i })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /A Very Long Editorial.*2 active share links/i })).toBeInTheDocument();
    expect(screen.getByText('3 watching')).toBeInTheDocument();
    expect(screen.getAllByText('Photos')).toHaveLength(2);
    expect(screen.getAllByText('Storage')).toHaveLength(2);
    expect(screen.getAllByText('Links')).toHaveLength(2);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'A Very Long Editorial Project Title That Still Needs To Fit Cleanly On The Card',
      }),
    ).toHaveClass('wrap-anywhere', 'line-clamp-2');
    expect(screen.getByRole('link', { name: 'Open Wedding Weekend' })).toHaveAttribute(
      'href',
      '/projects/project-1',
    );

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
        sort_by: 'manual_order',
        order: 'asc',
      });
    });
  });

  it('polls project delivery activity every 60 seconds without returning to loading state', async () => {
    vi.useFakeTimers();
    const { projectService } = await import('../../services/projectService');

    render(<DashboardPageWrapper />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Wedding Weekend')).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading projects')).not.toBeInTheDocument();
    vi.mocked(projectService.getProjects).mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(projectService.getProjects).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Wedding Weekend')).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading projects')).not.toBeInTheDocument();
  });

  it('ignores a stale project response after a newer request has completed', async () => {
    const { projectService } = await import('../../services/projectService');
    const freshProject = makeProject({ id: 'project-fresh', name: 'Fresh Result' });
    let resolveStale!: (value: {
      projects: Project[];
      total: number;
      page: number;
      size: number;
    }) => void;
    const staleRequest = new Promise<{
      projects: Project[];
      total: number;
      page: number;
      size: number;
    }>((resolve) => {
      resolveStale = resolve;
    });

    vi.mocked(projectService.getProjects)
      .mockReturnValueOnce(staleRequest)
      .mockResolvedValueOnce({
        projects: [freshProject],
        total: 1,
        page: 1,
        size: 18,
      });

    render(<DashboardPageWrapper />);
    fillInput(screen.getByLabelText('Search projects'), 'fresh');

    expect(await screen.findByText('Fresh Result', {}, { timeout: 1500 })).toBeInTheDocument();

    await act(async () => {
      resolveStale({
        projects: mockProjects,
        total: mockProjects.length,
        page: 1,
        size: 18,
      });
      await staleRequest;
    });

    expect(screen.getByText('Fresh Result')).toBeInTheDocument();
    expect(screen.queryByText('Wedding Weekend')).not.toBeInTheDocument();
  });

  it('requests project search from query params', async () => {
    const { projectService } = await import('../../services/projectService');

    render(<DashboardPageWrapper initialPath="/dashboard?search=weekend" />);

    await waitFor(() => {
      expect(projectService.getProjects).toHaveBeenCalledWith(1, 18, {
        search: 'weekend',
        sort_by: 'manual_order',
        order: 'asc',
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
        sort_by: 'manual_order',
        order: 'asc',
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
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard?sort_by=photo_count');
  });

  it('updates project search and resets pagination without dropping the search query', async () => {
    const { projectService } = await import('../../services/projectService');

    render(<DashboardPageWrapper initialPath="/dashboard?page=3" />);

    await waitFor(() => {
      expect(projectService.getProjects).toHaveBeenCalledWith(3, 18, {
        search: undefined,
        sort_by: 'manual_order',
        order: 'asc',
      });
    });

    fillInput(screen.getByLabelText('Search projects'), 'client');

    await waitFor(
      () => {
        expect(projectService.getProjects).toHaveBeenLastCalledWith(1, 18, {
          search: 'client',
          sort_by: 'manual_order',
          order: 'asc',
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
        sort_by: 'manual_order',
        order: 'asc',
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
        sort_by: 'manual_order',
        order: 'asc',
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
    await user.click(screen.getByRole('button', { name: 'New project' }));
    fillInput(screen.getByPlaceholderText('Project name'), 'Client Delivery');
    await user.click(screen.getByRole('button', { name: 'Create Project' }));

    await waitFor(() => {
      expect(projectService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Client Delivery' }),
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith('/projects/project-3');
  });

  it('reports clipboard failures without announcing a successful copy', async () => {
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard access denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    try {
      render(<DashboardPageWrapper />);

      await screen.findByText('Wedding Weekend');
      fireEvent.click(
        screen.getByLabelText(
          'Project actions for A Very Long Editorial Project Title That Still Needs To Fit Cleanly On The Card',
        ),
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Copy latest share link' }));

      expect(await screen.findByText('Clipboard access denied')).toBeInTheDocument();
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/share/share-2`);
      expect(
        screen.queryByText(
          'Latest share link for A Very Long Editorial Project Title That Still Needs To Fit Cleanly On The Card copied.',
        ),
      ).not.toBeInTheDocument();
    } finally {
      if (clipboardDescriptor) {
        Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, 'clipboard');
      }
    }
  });

  it('creates a project when Enter is pressed in the project modal', async () => {
    const user = userEvent.setup();
    const { projectService } = await import('../../services/projectService');

    vi.mocked(projectService.createProject).mockResolvedValue(
      makeProject({
        id: 'project-3',
        name: 'Keyboard Delivery',
        entry_gallery_id: null,
        entry_gallery_name: null,
        has_entry_gallery: false,
        gallery_count: 0,
        visible_gallery_count: 0,
      }),
    );

    render(<DashboardPageWrapper />);

    await screen.findByText('Wedding Weekend');
    await user.click(screen.getByRole('button', { name: 'New project' }));
    await user.type(screen.getByPlaceholderText('Project name'), 'Keyboard Delivery{Enter}');

    await waitFor(() => {
      expect(projectService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Keyboard Delivery' }),
      );
    });
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
    await user.click(screen.getByRole('button', { name: 'New project' }));
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
    fireEvent.click(screen.getByLabelText('Project actions for Wedding Weekend'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete project' }));

    const deleteDialog = await screen.findByRole('dialog', { name: /delete project/i });
    expect(
      within(deleteDialog).getByText(/delete “Wedding Weekend” and all of its galleries/i),
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
    fireEvent.click(screen.getByLabelText('Project actions for Last Project'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete project' }));
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
        sort_by: 'manual_order',
        order: 'asc',
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
      name: 'Create your first project',
    });
    const emptyState = emptyHeading.closest('div');

    expect(
      screen.getByText(
        'Projects group related galleries and share-link deliveries for one client.',
      ),
    ).toBeInTheDocument();

    expect(
      within(emptyState as HTMLElement).getByRole('button', { name: 'New project' }),
    ).toBeInTheDocument();
  });
});
