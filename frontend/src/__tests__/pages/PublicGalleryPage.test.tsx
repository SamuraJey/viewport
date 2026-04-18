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
const mockNavigate = vi.fn();
let mockRouteParams: { shareId: string; resumeToken?: string; folderId?: string } = {
  shareId: 'abc123',
};

// Mock data for public gallery
const mockPublicGallery = {
  scope_type: 'gallery' as const,
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
  scope_type: 'gallery' as const,
  photos: [],
  cover: null,
  photographer: undefined,
  gallery_name: 'Empty Gallery',
  total_photos: 0,
};

const mockProjectShare = {
  scope_type: 'project' as const,
  project_id: 'project-1',
  project_name: 'Wedding Weekend',
  photographer: 'Jane Doe',
  date: '2025-09-21',
  site_url: 'https://example.com',
  total_listed_folders: 2,
  total_listed_photos: 8,
  folders: [
    {
      folder_id: 'gallery-1',
      folder_name: 'Photos',
      photo_count: 5,
      route_path: '/share/abc123/folders/gallery-1',
      direct_share_path: null,
    },
    {
      folder_id: 'gallery-2',
      folder_name: '3eds',
      photo_count: 3,
      route_path: '/share/abc123/folders/gallery-2',
      direct_share_path: null,
    },
  ],
};

const mockProjectGallery = {
  ...mockPublicGallery,
  gallery_name: 'Photos',
  project_id: 'project-1',
  project_name: 'Wedding Weekend',
  parent_share_id: 'abc123',
};

// Mock shareLinkService
vi.mock('../../services/shareLinkService', () => ({
  shareLinkService: {
    getSharedGallery: vi.fn(),
    getPublicSelectionConfig: vi.fn(),
    getPublicSelectionSession: vi.fn(),
    startPublicSelectionSession: vi.fn(),
    togglePublicSelectionItem: vi.fn(),
    updatePublicSelectionItemComment: vi.fn(),
    updatePublicSelectionSession: vi.fn(),
    submitPublicSelectionSession: vi.fn(),
    getPublicPhotosByIds: vi.fn(),
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
    useParams: () => mockRouteParams,
    useNavigate: () => mockNavigate,
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
    mockNavigate.mockReset();
    mockRouteParams = { shareId: 'abc123' };
    window.localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { shareLinkService } = await import('../../services/shareLinkService');
    vi.mocked(shareLinkService.getSharedGallery).mockResolvedValue(mockPublicGallery);
    vi.mocked(shareLinkService.getPublicSelectionConfig).mockRejectedValue({
      response: { status: 404, data: { detail: 'Selection is not enabled' } },
    } as any);
    // Load component after mocks are configured
    PublicGalleryPage = (await import('../../pages/PublicGalleryPage')).PublicGalleryPage;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render fullscreen skeleton while loading', async () => {
    const { container } = render(wrapper());
    expect(container.querySelector('[data-testid="skeleton-loader"]')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: /loading gallery/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Photos')).toBeInTheDocument();
      expect(screen.getByText('(2)')).toBeInTheDocument();
    });
  });

  it('renders gallery with cover, meta and photos', async () => {
    render(wrapper());

    await waitFor(() => {
      expect(screen.getByText('Photos')).toBeInTheDocument();
      expect(screen.getByText('(2)')).toBeInTheDocument();
    });

    // Cover title and photographer
    expect(screen.getByText('Public Gallery')).toBeInTheDocument();
    expect(screen.getByText('By Jane Doe')).toBeInTheDocument();
    // Download All button present
    expect(screen.getByRole('button', { name: /download all photos/i })).toBeInTheDocument();
    // Photos rendered
    const thumbs = screen.getAllByTestId('public-batch');
    expect(thumbs).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /finish selection/i })).not.toBeInTheDocument();
    expect(document.getElementById('gallery-content')).toBeInTheDocument();
  });

  it('opens photo lightbox when clicking a photo', async () => {
    render(wrapper());

    await waitFor(() => {
      expect(screen.getByText('Photos')).toBeInTheDocument();
      expect(screen.getByText('(2)')).toBeInTheDocument();
    });

    const first = screen.getAllByTestId('public-batch')[0];
    const button = within(first).getByRole('button');
    await userEvent.click(button);

    await waitFor(() => expect(screen.getByTestId('lightbox')).toBeInTheDocument());
    // Check that lightbox slides are rendered
    expect(screen.getAllByTestId('lightbox-slide')).toHaveLength(2);
  });

  it('keeps decorative hero images out of the accessible image tree', async () => {
    render(wrapper());

    await waitFor(() => {
      expect(screen.getByText('Photos')).toBeInTheDocument();
    });

    expect(screen.queryByRole('img', { name: /gallery cover/i })).not.toBeInTheDocument();
  });

  it('shows empty state when no photos', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    vi.mocked(shareLinkService.getSharedGallery).mockResolvedValue(mockEmptyGallery);

    render(wrapper());

    await waitFor(() => expect(screen.getByText('No photos in this gallery')).toBeInTheDocument());
    expect(
      screen.getByText('This gallery appears to be empty. Check back later for updates.'),
    ).toBeInTheDocument();
  });

  it('shows error state when fetch fails', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    vi.mocked(shareLinkService.getSharedGallery).mockRejectedValue(new Error('not found'));

    render(wrapper());

    await waitFor(() => expect(screen.getByText('Gallery Not Available')).toBeInTheDocument());
    expect(screen.getByText(/Gallery not found/i)).toBeInTheDocument();
  });

  it('shows dedicated expired state for 410 responses', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    vi.mocked(shareLinkService.getSharedGallery).mockRejectedValue({
      response: {
        status: 410,
      },
    });

    render(wrapper());

    await waitFor(() => expect(screen.getByText('Link Has Expired')).toBeInTheDocument());
    expect(
      screen.getByText('This share link is no longer active. Ask the photographer for a new one.'),
    ).toBeInTheDocument();
  });

  it('calls window.open when Download All clicked', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null as any);

    render(wrapper());

    await waitFor(() => {
      expect(screen.getByText('Photos')).toBeInTheDocument();
      expect(screen.getByText('(2)')).toBeInTheDocument();
    });

    const btn = screen.getByRole('button', { name: /download all photos/i });
    await userEvent.click(btn);

    // Should use VITE_API_URL from environment, or fallback to localhost:8000
    const expectedUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/s/abc123/download/all`;
    expect(openSpy).toHaveBeenCalledWith(expectedUrl, '_blank');
    openSpy.mockRestore();
  });

  it('redirects project shares to the first visible gallery by default', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    vi.mocked(shareLinkService.getSharedGallery).mockResolvedValue(mockProjectShare as any);

    render(wrapper());

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/share/abc123/folders/gallery-1', {
        replace: true,
      });
    });
  });

  it('renders a horizontal project gallery list without preview cards', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    mockRouteParams = { shareId: 'abc123', folderId: 'gallery-1' };
    vi.mocked(shareLinkService.getSharedGallery).mockImplementation(async (_shareId, options) => {
      if (options?.folderId) {
        return mockProjectGallery as any;
      }
      return mockProjectShare as any;
    });

    render(wrapper());

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Photos' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '3eds' })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'Photos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download project/i })).toBeInTheDocument();
    expect(screen.queryByText('Download visible folders')).not.toBeInTheDocument();
  });

  it('renders dedicated favorites view with finish button and back navigation', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    mockRouteParams = { shareId: 'abc123', resumeToken: 'resume-token' };

    vi.mocked(shareLinkService.getPublicSelectionConfig).mockResolvedValue({
      is_enabled: true,
      list_title: 'Selected photos',
      limit_enabled: false,
      limit_value: null,
      allow_photo_comments: false,
      require_name: true,
      require_email: false,
      require_phone: false,
      require_client_note: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);
    vi.mocked(shareLinkService.getPublicSelectionSession).mockResolvedValue({
      id: 'session-1',
      sharelink_id: 'abc123',
      status: 'in_progress',
      client_name: 'Jane Client',
      client_email: null,
      client_phone: null,
      client_note: null,
      selected_count: 1,
      submitted_at: null,
      last_activity_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resume_token: 'resume-token',
      items: [
        {
          photo_id: 'p1',
          comment: null,
          selected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    } as any);

    render(wrapper());

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /finish selection/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /back to gallery/i })).toBeInTheDocument();
    expect(screen.getByText('Jane Client • in_progress')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download all photos/i })).not.toBeInTheDocument();
  });

  it('persists route resume token locally after opening favorites link', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    mockRouteParams = { shareId: 'abc123', resumeToken: 'resume-token' };

    vi.mocked(shareLinkService.getPublicSelectionConfig).mockResolvedValue({
      is_enabled: true,
      list_title: 'Selected photos',
      limit_enabled: false,
      limit_value: null,
      allow_photo_comments: false,
      require_name: true,
      require_email: false,
      require_phone: false,
      require_client_note: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);
    vi.mocked(shareLinkService.getPublicSelectionSession).mockResolvedValue({
      id: 'session-1',
      sharelink_id: 'abc123',
      status: 'in_progress',
      client_name: 'Jane Client',
      client_email: null,
      client_phone: null,
      client_note: null,
      selected_count: 1,
      submitted_at: null,
      last_activity_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resume_token: 'resume-token',
      items: [],
    } as any);

    render(wrapper());

    await waitFor(() => {
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'viewport-selection-resume-abc123',
        'resume-token',
      );
    });
  });
});
