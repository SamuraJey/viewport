import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ProjectPage } from '../../pages/ProjectPage';

vi.mock('../../services/projectService', () => ({
  projectService: {
    getProject: vi.fn(),
    getProjects: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    createProjectFolder: vi.fn(),
  },
}));

vi.mock('../../services/shareLinkService', () => ({
  shareLinkService: {
    getProjectShareLinks: vi.fn(),
    createProjectShareLink: vi.fn(),
    updateProjectShareLink: vi.fn(),
    deleteProjectShareLink: vi.fn(),
    updateShareLinkSelectionConfig: vi.fn(),
  },
}));

vi.mock('../../services/galleryService', () => ({
  galleryService: {
    updateGallery: vi.fn(),
    deleteGallery: vi.fn(),
  },
}));

describe('ProjectPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { projectService } = await import('../../services/projectService');
    const { shareLinkService } = await import('../../services/shareLinkService');

    vi.mocked(projectService.getProject).mockResolvedValue({
      id: 'project-1',
      owner_id: 'user-1',
      name: 'Wedding Weekend',
      created_at: '2026-04-18T00:00:00Z',
      shooting_date: '2026-04-18',
      folder_count: 2,
      listed_folder_count: 1,
      total_photo_count: 12,
      total_size_bytes: 1024,
      has_active_share_links: true,
      recent_folder_thumbnail_urls: [],
      folders: [
        {
          id: 'gallery-1',
          owner_id: 'user-1',
          project_id: 'project-1',
          project_name: 'Wedding Weekend',
          project_position: 0,
          project_visibility: 'listed',
          name: 'Photos',
          created_at: '2026-04-18T00:00:00Z',
          shooting_date: '2026-04-18',
          cover_photo_id: null,
          photo_count: 8,
          total_size_bytes: 512,
          has_active_share_links: true,
          cover_photo_thumbnail_url: null,
          recent_photo_thumbnail_urls: [],
        },
        {
          id: 'gallery-2',
          owner_id: 'user-1',
          project_id: 'project-1',
          project_name: 'Wedding Weekend',
          project_position: 1,
          project_visibility: 'direct_only',
          name: '3eds',
          created_at: '2026-04-18T00:00:00Z',
          shooting_date: '2026-04-18',
          cover_photo_id: null,
          photo_count: 4,
          total_size_bytes: 512,
          has_active_share_links: false,
          cover_photo_thumbnail_url: null,
          recent_photo_thumbnail_urls: [],
        },
      ],
    } as any);

    vi.mocked(shareLinkService.getProjectShareLinks).mockResolvedValue([
      {
        id: 'link-1',
        scope_type: 'project',
        project_id: 'project-1',
        label: 'Client proofing',
        is_active: true,
        expires_at: null,
        views: 0,
        zip_downloads: 0,
        single_downloads: 0,
        created_at: '2026-04-18T00:00:00Z',
        updated_at: '2026-04-18T00:00:00Z',
      },
    ] as any);
  });

  it('reuses the gallery share-links section UI for project links', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/project-1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: /share links/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create new share link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /all links/i })).toBeInTheDocument();
    expect(screen.getByText('Client proofing')).toBeInTheDocument();
  });

  it('lets project share creation expose selection settings', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/projects/project-1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: /share links/i });
    await user.click(screen.getByRole('button', { name: /create new share link/i }));

    const selectionTab = await screen.findByRole('tab', { name: /selection/i });
    expect(selectionTab).toBeInTheDocument();
    await user.click(selectionTab);
    expect(screen.getByText(/client photo selection/i)).toBeInTheDocument();
  });

  it('renders project galleries as full gallery cards instead of tab buttons', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/project-1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Photos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '3eds' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Photos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '3eds' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Visible in project').length).toBeGreaterThan(0);
    expect(screen.getByText('Direct link only')).toBeInTheDocument();
    expect(screen.getByLabelText('Change project visibility for Photos')).toBeInTheDocument();
    expect(screen.getByLabelText('Change project visibility for 3eds')).toBeInTheDocument();
  });

  it('shows persisted project gallery order on the cards', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/project-1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Photos' });
    expect(screen.getByText('Position 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Position 2 of 2')).toBeInTheDocument();
  });
});
