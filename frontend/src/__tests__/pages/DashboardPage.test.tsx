import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { DashboardPage } from '../../pages/DashboardPage';
import type { Gallery, Project } from '../../types';

const makeGallery = (overrides: Partial<Gallery>): Gallery => ({
  id: 'gallery-1',
  owner_id: 'user-1',
  name: 'Gallery 1',
  created_at: '2024-01-01T00:00:00Z',
  shooting_date: '2024-01-01',
  public_sort_by: 'original_filename',
  public_sort_order: 'asc',
  cover_photo_id: null,
  photo_count: 0,
  total_size_bytes: 0,
  has_active_share_links: false,
  cover_photo_thumbnail_url: null,
  recent_photo_thumbnail_urls: [],
  ...overrides,
});

const mockGalleries: Gallery[] = [
  makeGallery({
    id: '1',
    name: 'Alpha Gallery',
    created_at: '2024-01-02T00:00:00Z',
    photo_count: 12,
  }),
  makeGallery({
    id: '2',
    name: 'Beta Gallery',
    created_at: '2024-01-01T00:00:00Z',
    photo_count: 5,
  }),
];

const makeProject = (overrides: Partial<Project>): Project => ({
  id: 'project-1',
  owner_id: 'user-1',
  name: 'Project 1',
  created_at: '2024-01-01T00:00:00Z',
  shooting_date: '2024-01-01',
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
    total_photo_count: 20,
  }),
];

vi.mock('../../services/galleryService', () => ({
  galleryService: {
    getGalleries: vi.fn(),
    createGallery: vi.fn(),
    deleteGallery: vi.fn(),
    updateGallery: vi.fn(),
  },
}));

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

const DashboardPageWrapper = ({ initialPath = '/dashboard' }: { initialPath?: string }) => (
  <MemoryRouter initialEntries={[initialPath]}>
    <DashboardPage />
  </MemoryRouter>
);

describe('DashboardPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { galleryService } = await import('../../services/galleryService');
    const { projectService } = await import('../../services/projectService');
    vi.mocked(galleryService.getGalleries).mockResolvedValue({
      galleries: mockGalleries,
      total: mockGalleries.length,
      page: 1,
      size: 10,
    });
    vi.mocked(projectService.getProjects).mockResolvedValue({
      projects: mockProjects,
      total: mockProjects.length,
      page: 1,
      size: 50,
    });
  });

  it('renders title, controls, and add gallery card', async () => {
    render(<DashboardPageWrapper />);

    await screen.findByText('Wedding Weekend');

    expect(screen.getByText('Projects & Folders')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Standalone folders')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create new project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create new gallery' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search galleries')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort galleries by')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort order')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create new gallery card' })).toBeInTheDocument();
    });
  });

  it('fetches galleries using server-side pagination defaults', async () => {
    const { galleryService } = await import('../../services/galleryService');

    render(<DashboardPageWrapper />);

    await waitFor(() => {
      expect(galleryService.getGalleries).toHaveBeenCalledWith(1, 10, {
        search: undefined,
        sort_by: 'created_at',
        order: 'desc',
        standalone_only: true,
      });
    });
  });

  it('requests debounced search from the server', async () => {
    const user = userEvent.setup();
    const { galleryService } = await import('../../services/galleryService');
    render(<DashboardPageWrapper />);

    await screen.findByText('Alpha Gallery');

    const search = screen.getByLabelText('Search galleries');
    await user.type(search, 'beta');

    await waitFor(() => {
      expect(galleryService.getGalleries).toHaveBeenCalledWith(1, 10, {
        search: 'beta',
        sort_by: 'created_at',
        order: 'desc',
        standalone_only: true,
      });
    });
  });

  it('requests sort options from query params', async () => {
    const { galleryService } = await import('../../services/galleryService');
    render(<DashboardPageWrapper initialPath="/dashboard?sort_by=name&order=asc" />);

    await waitFor(() => {
      expect(galleryService.getGalleries).toHaveBeenCalledWith(1, 10, {
        search: undefined,
        sort_by: 'name',
        order: 'asc',
        standalone_only: true,
      });
    });
  });

  it('opens create modal and submits gallery creation', async () => {
    const user = userEvent.setup();
    const { galleryService } = await import('../../services/galleryService');

    vi.mocked(galleryService.createGallery).mockResolvedValue(
      makeGallery({
        id: '3',
        name: 'Test Gallery',
      }),
    );

    render(<DashboardPageWrapper />);

    const openButton = screen.getByRole('button', { name: 'Create new gallery' });
    await user.click(openButton);

    const input = screen.getByPlaceholderText('Gallery name');
    await user.type(input, 'Test Gallery');
    await user.click(screen.getByRole('button', { name: 'Create Gallery' }));

    expect(galleryService.createGallery).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Test Gallery' }),
    );
  });

  it('does not update a gallery when the title is unchanged', async () => {
    const user = userEvent.setup();
    const { galleryService } = await import('../../services/galleryService');

    render(<DashboardPageWrapper />);

    await screen.findByText('Alpha Gallery');

    await user.click(screen.getByRole('button', { name: 'Rename Alpha Gallery' }));
    await user.keyboard('{Enter}');

    expect(galleryService.updateGallery).not.toHaveBeenCalled();
  });

  it('shows empty state when no galleries exist', async () => {
    const { galleryService } = await import('../../services/galleryService');
    const { projectService } = await import('../../services/projectService');
    vi.mocked(galleryService.getGalleries).mockResolvedValue({
      galleries: [],
      total: 0,
      page: 1,
      size: 10,
    });
    vi.mocked(projectService.getProjects).mockResolvedValue({
      projects: [],
      total: 0,
      page: 1,
      size: 50,
    });

    render(<DashboardPageWrapper />);

    await waitFor(() => {
      expect(
        screen.getByText('No projects yet. Create a project to group related folders.'),
      ).toBeInTheDocument();
      expect(screen.getByText('No standalone folders yet')).toBeInTheDocument();
    });
  });
});
