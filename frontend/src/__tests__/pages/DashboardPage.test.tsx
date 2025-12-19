import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../../pages/DashboardPage';

// Mock the gallery service
const mockGalleries = [
  {
    id: '1',
    owner_id: 'user1',
    name: 'Gallery 1',
    created_at: '2024-01-01T00:00:00Z',
    shooting_date: '2024-01-01',
  },
  {
    id: '2',
    owner_id: 'user1',
    name: 'Gallery 2',
    created_at: '2024-01-02T00:00:00Z',
    shooting_date: '2024-01-02',
  },
];

vi.mock('../../services/galleryService', () => ({
  galleryService: {
    getGalleries: vi.fn(),
    createGallery: vi.fn(),
    deleteGallery: vi.fn(),
  },
}));

// Mock Layout component
vi.mock('../../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}));

const DashboardPageWrapper = () => {
  return (
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
};

describe('DashboardPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Default mock response
    const { galleryService } = await import('../../services/galleryService');
    vi.mocked(galleryService.getGalleries).mockResolvedValue({
      galleries: mockGalleries,
      total: 2,
      page: 1,
      size: 9,
    });
  });

  it('should render dashboard layout correctly', async () => {
    const { galleryService } = await import('../../services/galleryService');
    vi.mocked(galleryService.getGalleries).mockResolvedValue({
      galleries: [],
      total: 0,
      page: 1,
      size: 9,
    });

    render(<DashboardPageWrapper />);

    expect(screen.getByText('My Galleries')).toBeInTheDocument();
    expect(
      screen.getByText('Your personal space to organize and share moments.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Gallery' })).toBeInTheDocument();

    // Should show empty state
    await waitFor(() => {
      expect(screen.getByText('No galleries yet')).toBeInTheDocument();
    });
  });

  it('should load and display galleries', async () => {
    const { galleryService } = await import('../../services/galleryService');

    render(<DashboardPageWrapper />);

    await waitFor(() => {
      expect(screen.queryByText('Loading galleries...')).not.toBeInTheDocument();
    });

    expect(galleryService.getGalleries).toHaveBeenCalledWith(1, 9);
  });

  it('should handle gallery creation', async () => {
    const { galleryService } = await import('../../services/galleryService');
    vi.mocked(galleryService.createGallery).mockResolvedValue({
      id: '3',
      owner_id: 'user1',
      name: 'Test Gallery',
      created_at: new Date().toISOString(),
      shooting_date: '2024-01-01',
    });

    render(<DashboardPageWrapper />);
    // Open the creation modal
    const headerButton = screen.getByRole('button', { name: 'New Gallery' });
    await userEvent.click(headerButton);
    // Enter gallery name
    const input = screen.getByPlaceholderText('Gallery name') as HTMLInputElement;
    await userEvent.type(input, 'Test Gallery');
    // Click Create Gallery button
    const modalCreate = screen.getByRole('button', { name: 'Create Gallery' });
    await userEvent.click(modalCreate);

    expect(galleryService.createGallery).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Test Gallery' }),
    );
  });

  // it('should handle error when loading galleries', async () => {
  //   const { galleryService } = await import('../../services/galleryService')
  //   vi.mocked(galleryService.getGalleries).mockRejectedValue(new Error('Network error'))

  //   render(<DashboardPageWrapper />)

  //   await waitFor(() => {
  //     expect(screen.getByText('Failed to load galleries. Please try again.')).toBeInTheDocument()
  //   })
  // })

  it('should display empty state when no galleries', async () => {
    const { galleryService } = await import('../../services/galleryService');
    vi.mocked(galleryService.getGalleries).mockResolvedValue({
      galleries: [],
      total: 0,
      page: 1,
      size: 9,
    });

    render(<DashboardPageWrapper />);

    await waitFor(() => {
      expect(screen.getByText('No galleries yet')).toBeInTheDocument();
    });
  });
});
