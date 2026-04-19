import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
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
    reorderProjectGalleries: vi.fn(),
  },
}));

vi.mock('../../services/shareLinkService', () => ({
  shareLinkService: {
    getProjectShareLinks: vi.fn(),
    getProjectWarningShareLinks: vi.fn(),
    createProjectShareLink: vi.fn(),
    createShareLink: vi.fn(),
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

const renderProjectPage = () =>
  render(
    <MemoryRouter initialEntries={['/projects/project-1']}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectPage />} />
      </Routes>
    </MemoryRouter>,
  );

const projectSelectionSummary = {
  is_enabled: true,
  status: 'in_progress',
  total_sessions: 2,
  submitted_sessions: 1,
  in_progress_sessions: 1,
  closed_sessions: 0,
  selected_count: 6,
  latest_activity_at: '2026-04-18T00:00:00Z',
};

const projectProofingShareLink = (overrides: Record<string, unknown> = {}) => ({
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
  selection_summary: projectSelectionSummary,
  ...overrides,
});

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
    vi.mocked(shareLinkService.getProjectWarningShareLinks).mockResolvedValue([
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
    renderProjectPage();

    expect(await screen.findByRole('heading', { name: /share links/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create new share link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /all links/i })).toBeInTheDocument();
    expect(screen.getByText('Client proofing')).toBeInTheDocument();
  });

  it('lets project share creation expose selection settings', async () => {
    const user = userEvent.setup();

    renderProjectPage();

    await screen.findByRole('heading', { name: /share links/i });
    await user.click(screen.getByRole('button', { name: /create new share link/i }));

    const selectionTab = await screen.findByRole('tab', { name: /selection/i });
    expect(selectionTab).toBeInTheDocument();
    await user.click(selectionTab);
    expect(screen.getByText(/client photo selection/i)).toBeInTheDocument();
  });

  it('renders project galleries as full gallery cards instead of tab buttons', async () => {
    renderProjectPage();

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
    renderProjectPage();

    await screen.findByRole('heading', { name: 'Photos' });
    expect(screen.getByText('Position 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Position 2 of 2')).toBeInTheDocument();
  });

  it('warns before deleting a gallery when project proofing sessions already exist', async () => {
    const user = userEvent.setup();
    const { shareLinkService } = await import('../../services/shareLinkService');

    vi.mocked(shareLinkService.getProjectShareLinks).mockResolvedValueOnce([
      projectProofingShareLink(),
    ] as any);
    vi.mocked(shareLinkService.getProjectWarningShareLinks).mockResolvedValueOnce([
      projectProofingShareLink(),
    ] as any);

    renderProjectPage();

    expect(
      await screen.findByText(/active\/submitted selection sessions across 1 project link/i),
    ).toBeInTheDocument();

    await user.click(screen.getByLabelText('Delete 3eds'));

    expect(
      await screen.findByText(/can remove photos that clients already selected/i),
    ).toBeInTheDocument();
  });

  it('warns before hiding a gallery from the project when proofing sessions already exist', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');

    vi.mocked(shareLinkService.getProjectShareLinks).mockResolvedValueOnce([
      projectProofingShareLink(),
    ] as any);
    vi.mocked(shareLinkService.getProjectWarningShareLinks).mockResolvedValueOnce([
      projectProofingShareLink(),
    ] as any);

    renderProjectPage();

    expect(
      await screen.findByText(/active\/submitted selection sessions across 1 project link/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Change project visibility for Photos'));
    fireEvent.click(await screen.findByRole('button', { name: /direct link only/i }));

    expect(await screen.findByText('Hide gallery from project share?')).toBeInTheDocument();
  });

  it('warns before reordering galleries when proofing sessions already exist', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');

    vi.mocked(shareLinkService.getProjectShareLinks).mockResolvedValueOnce([
      projectProofingShareLink(),
    ] as any);
    vi.mocked(shareLinkService.getProjectWarningShareLinks).mockResolvedValueOnce([
      projectProofingShareLink(),
    ] as any);

    renderProjectPage();

    expect(
      await screen.findByText(/active\/submitted selection sessions across 1 project link/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Change project visibility for 3eds'));
    fireEvent.click(await screen.findByRole('button', { name: /move earlier/i }));

    expect(await screen.findByText('Reorder project galleries?')).toBeInTheDocument();
  });

  it('reorders galleries through the atomic project endpoint', async () => {
    const { projectService } = await import('../../services/projectService');

    renderProjectPage();

    expect(await screen.findByRole('heading', { name: 'Photos' })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Change project visibility for 3eds'));
    fireEvent.click(await screen.findByRole('button', { name: /move earlier/i }));

    expect(projectService.reorderProjectGalleries).toHaveBeenCalledWith('project-1', [
      'gallery-2',
      'gallery-1',
    ]);
  });

  it('refreshes project state after creating a gallery share link', async () => {
    const user = userEvent.setup();
    const { projectService } = await import('../../services/projectService');
    const { shareLinkService } = await import('../../services/shareLinkService');

    vi.mocked(shareLinkService.createShareLink).mockResolvedValueOnce({
      id: 'gallery-link-1',
      gallery_id: 'gallery-1',
      scope_type: 'gallery',
      expires_at: null,
      views: 0,
      zip_downloads: 0,
      single_downloads: 0,
      created_at: '2026-04-18T00:00:00Z',
    } as any);

    renderProjectPage();

    expect(await screen.findByRole('heading', { name: 'Photos' })).toBeInTheDocument();
    await user.click(screen.getByLabelText('Share Photos'));
    await user.click(await screen.findByRole('button', { name: /^Create link$/i }));

    expect(shareLinkService.createShareLink).toHaveBeenCalledWith('gallery-1', {
      label: null,
      is_active: true,
      expires_at: null,
    });
    expect(projectService.getProject).toHaveBeenCalledTimes(2);
  });

  it('warns before deleting the whole project when project proofing sessions already exist', async () => {
    const user = userEvent.setup();
    const { shareLinkService } = await import('../../services/shareLinkService');

    vi.mocked(shareLinkService.getProjectShareLinks).mockResolvedValueOnce([
      projectProofingShareLink(),
    ] as any);
    vi.mocked(shareLinkService.getProjectWarningShareLinks).mockResolvedValueOnce([
      projectProofingShareLink(),
    ] as any);

    renderProjectPage();

    expect(
      await screen.findByText(/active\/submitted selection sessions across 1 project link/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /delete project/i }));

    expect(await screen.findByText('Delete project?')).toBeInTheDocument();
    expect(
      screen.getByText(
        /can invalidate active proofing sessions and remove photos clients already selected/i,
      ),
    ).toBeInTheDocument();
  });

  it('warns before deleting a gallery when only a direct gallery share has active selection sessions', async () => {
    const user = userEvent.setup();
    const { shareLinkService } = await import('../../services/shareLinkService');

    vi.mocked(shareLinkService.getProjectShareLinks).mockResolvedValueOnce([] as any);
    vi.mocked(shareLinkService.getProjectWarningShareLinks).mockResolvedValueOnce([
      {
        id: 'gallery-link-1',
        scope_type: 'gallery',
        gallery_id: 'gallery-2',
        label: 'Direct 3eds proof',
        is_active: true,
        expires_at: null,
        views: 0,
        zip_downloads: 0,
        single_downloads: 0,
        created_at: '2026-04-18T00:00:00Z',
        updated_at: '2026-04-18T00:00:00Z',
        selection_summary: projectSelectionSummary,
      },
    ] as any);

    renderProjectPage();

    await screen.findByRole('heading', { name: 'Photos' });
    await user.click(screen.getByLabelText('Delete 3eds'));

    expect(
      await screen.findByText(/active\/submitted selection sessions across 1 share link/i),
    ).toBeInTheDocument();
  });

  it('warns before deleting the whole project when only a direct gallery share has active selection sessions', async () => {
    const user = userEvent.setup();
    const { shareLinkService } = await import('../../services/shareLinkService');

    vi.mocked(shareLinkService.getProjectShareLinks).mockResolvedValueOnce([] as any);
    vi.mocked(shareLinkService.getProjectWarningShareLinks).mockResolvedValueOnce([
      {
        id: 'gallery-link-1',
        scope_type: 'gallery',
        gallery_id: 'gallery-1',
        label: 'Direct Photos proof',
        is_active: true,
        expires_at: null,
        views: 0,
        zip_downloads: 0,
        single_downloads: 0,
        created_at: '2026-04-18T00:00:00Z',
        updated_at: '2026-04-18T00:00:00Z',
        selection_summary: projectSelectionSummary,
      },
    ] as any);

    renderProjectPage();

    await screen.findByRole('heading', { name: 'Photos' });
    await user.click(screen.getByRole('button', { name: /delete project/i }));

    expect(
      await screen.findByText(/active\/submitted selection sessions across 1 share link/i),
    ).toBeInTheDocument();
  });
});
