import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { DashboardPage } from '../../pages/DashboardPage';
import type { Gallery } from '../../types';

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

vi.mock('../../services/galleryService', () => ({
  galleryService: {
    getGalleries: vi.fn(),
    createGallery: vi.fn(),
    deleteGallery: vi.fn(),
    updateGallery: vi.fn(),
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
    vi.mocked(galleryService.getGalleries).mockResolvedValue({
      galleries: mockGalleries,
      total: mockGalleries.length,
      page: 1,
      size: 100,
    });
  });

  it('renders title, controls, and add gallery card', async () => {
    render(<DashboardPageWrapper />);

    expect(screen.getByText('My Galleries')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create new gallery' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search galleries')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort galleries by')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort order')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create new gallery card' })).toBeInTheDocument();
    });
  });

  it('fetches galleries using bulk page size', async () => {
    const { galleryService } = await import('../../services/galleryService');

    render(<DashboardPageWrapper />);

    await waitFor(() => {
      expect(galleryService.getGalleries).toHaveBeenCalledWith(1, 100);
    });
  });

  it('filters galleries by debounced search', async () => {
    const user = userEvent.setup();
    render(<DashboardPageWrapper />);

    await waitFor(() => {
      expect(screen.getByText('Alpha Gallery')).toBeInTheDocument();
      expect(screen.getByText('Beta Gallery')).toBeInTheDocument();
    });

    const search = screen.getByLabelText('Search galleries');
    await user.type(search, 'beta');

    await waitFor(() => {
      expect(screen.queryByText('Alpha Gallery')).not.toBeInTheDocument();
      expect(screen.getByText('Beta Gallery')).toBeInTheDocument();
    });
  });

  it('sorts galleries by name asc via query params', async () => {
    render(<DashboardPageWrapper initialPath="/dashboard?sort_by=name&order=asc" />);

    const cards = await screen.findAllByRole('heading', { level: 3 });
    const names = cards.map((item) => item.textContent);

    expect(names).toContain('Alpha Gallery');
    expect(names).toContain('Beta Gallery');
    const alphaIndex = names.indexOf('Alpha Gallery');
    const betaIndex = names.indexOf('Beta Gallery');
    expect(alphaIndex).toBeLessThan(betaIndex);
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

  it('shows empty state when no galleries exist', async () => {
    const { galleryService } = await import('../../services/galleryService');
    vi.mocked(galleryService.getGalleries).mockResolvedValue({
      galleries: [],
      total: 0,
      page: 1,
      size: 100,
    });

    render(<DashboardPageWrapper />);

    await waitFor(() => {
      expect(screen.getByText('No galleries yet')).toBeInTheDocument();
    });
  });
});
