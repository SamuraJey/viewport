import { describe, it, expect, vi, beforeEach } from 'vitest';

// Polyfill ResizeObserver for jsdom environment used by Vitest
if (!(global as any).ResizeObserver) {
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
let PublicGalleryPage: any;

// Mock data for public gallery
const mockPublicGallery = {
  photos: [
    {
      photo_id: 'p1',
      thumbnail_url: '/thumbs/p1.jpg',
      full_url: '/full/p1.jpg',
      filename: '1.jpg',
    },
    {
      photo_id: 'p2',
      thumbnail_url: '/thumbs/p2.jpg',
      full_url: '/full/p2.jpg',
      filename: '2.jpg',
    },
  ],
  cover: { photo_id: 'p1', thumbnail_url: '/thumbs/p1.jpg', full_url: '/full/p1.jpg' },
  photographer: 'Jane Doe',
  gallery_name: 'Public Gallery',
  date: '2025-09-21',
  site_url: 'https://example.com',
  total_photos: 2,
};

const mockEmptyGallery = {
  photos: [],
  cover: null,
  photographer: undefined,
  gallery_name: 'Empty Gallery',
  total_photos: 0,
};

// Mock shareLinkService
vi.mock('../../services/shareLinkService', () => ({
  shareLinkService: {
    getSharedGallery: vi.fn(),
  },
}));

// Mock ThemeSwitch and Lightbox to keep tests focused
vi.mock('../../components/ThemeSwitch', () => ({
  ThemeSwitch: () => <button data-testid="theme-switch">T</button>,
}));

vi.mock('../../hooks/usePhotoLightbox', () => ({
  usePhotoLightbox: () => ({
    lightboxOpen: false,
    lightboxIndex: 0,
    openLightbox: vi.fn(),
    closeLightbox: vi.fn(),
    renderLightbox: (slides: any[]) => (
      <div data-testid="lightbox">
        {slides.map((slide, i) => (
          <div key={i} data-testid="lightbox-slide">
            {slide.src}
          </div>
        ))}
      </div>
    ),
  }),
}));

// Mock useParams to provide shareId
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ shareId: 'abc123' }),
  };
});

const wrapper = () => (
  <MemoryRouter>
    <PublicGalleryPage />
  </MemoryRouter>
);

describe('PublicGalleryPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { shareLinkService } = await import('../../services/shareLinkService');
    vi.mocked(shareLinkService.getSharedGallery).mockResolvedValue(mockPublicGallery);
    // Load component after mocks are configured
    PublicGalleryPage = (await import('../../pages/PublicGalleryPage')).PublicGalleryPage;
  });

  it('shows loading indicator initially', async () => {
    const { container } = render(wrapper());
    // Skeleton loading shows placeholder grid with animated elements
    expect(container.querySelector('[data-testid="skeleton-loader"]')).toBeInTheDocument();

    // Wait for loading to finish to avoid act() warning
    await waitFor(() => {
      expect(container.querySelector('[data-testid="skeleton-loader"]')).not.toBeInTheDocument();
    });
  });

  it('renders gallery with cover, meta and photos', async () => {
    render(wrapper());

    await waitFor(() => expect(screen.getByText('Photos (2)')).toBeInTheDocument());

    // Cover title and photographer
    expect(screen.getByText('Public Gallery')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    // Download All button present
    expect(screen.getByRole('button', { name: /download all photos/i })).toBeInTheDocument();
    // Photos rendered
    const thumbs = screen.getAllByTestId('public-batch');
    expect(thumbs).toHaveLength(2);
  });

  it('opens photo lightbox when clicking a photo', async () => {
    render(wrapper());

    await waitFor(() => expect(screen.getByText('Photos (2)')).toBeInTheDocument());

    const first = screen.getAllByTestId('public-batch')[0];
    const button = within(first).getByRole('button');
    await userEvent.click(button);

    await waitFor(() => expect(screen.getByTestId('lightbox')).toBeInTheDocument());
    // Check that lightbox slides are rendered
    expect(screen.getAllByTestId('lightbox-slide')).toHaveLength(2);
  });

  it('shows empty state when no photos', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    vi.mocked(shareLinkService.getSharedGallery).mockResolvedValue(mockEmptyGallery);

    render(wrapper());

    await waitFor(() => expect(screen.getByText('No photos in this gallery')).toBeInTheDocument());
    expect(screen.getByText('This gallery appears to be empty.')).toBeInTheDocument();
  });

  it('shows error state when fetch fails', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    vi.mocked(shareLinkService.getSharedGallery).mockRejectedValue(new Error('not found'));

    render(wrapper());

    await waitFor(() => expect(screen.getByText('Gallery Not Available')).toBeInTheDocument());
    expect(screen.getByText(/Gallery not found or link has expired/i)).toBeInTheDocument();
  });

  it('calls window.open when Download All clicked', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null as any);

    render(wrapper());

    await waitFor(() => expect(screen.getByText('Photos (2)')).toBeInTheDocument());

    const btn = screen.getByRole('button', { name: /download all photos/i });
    await userEvent.click(btn);

    // Should use VITE_API_URL from environment, or fallback to localhost:8000
    const expectedUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/s/abc123/download/all`;
    expect(openSpy).toHaveBeenCalledWith(expectedUrl, '_blank');
    openSpy.mockRestore();
  });
});
