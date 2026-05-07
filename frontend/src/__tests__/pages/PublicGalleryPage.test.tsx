import { describe, it, expect, vi, beforeEach } from 'vitest';

// Polyfill ResizeObserver for jsdom environment used by Vitest
if (!(global as any).ResizeObserver) {
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../lib/errorHandling';
let PublicGalleryPage: any;
const mockNavigate = vi.fn();
let mockRouteParams: {
  shareId: string;
  resumeToken?: string;
  galleryId?: string;
} = {
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
  total_size_bytes: 1536,
};

const mockEmptyGallery = {
  scope_type: 'gallery' as const,
  photos: [],
  cover: null,
  photographer: undefined,
  gallery_name: 'Empty Gallery',
  total_photos: 0,
  total_size_bytes: 0,
};

const mockProjectShare = {
  scope_type: 'project' as const,
  project_id: 'project-1',
  project_name: 'Wedding Weekend',
  photographer: 'Jane Doe',
  date: '2025-09-21',
  site_url: 'https://example.com',
  cover: {
    photo_id: 'project-cover',
    thumbnail_url: '/thumbs/project-cover.jpg',
    full_url: '/full/project-cover.jpg',
  },
  total_listed_folders: 2,
  total_listed_photos: 8,
  total_size_bytes: 4096,
  folders: [
    {
      folder_id: 'gallery-1',
      folder_name: 'Photos',
      photo_count: 5,
      route_path: '/share/abc123/galleries/gallery-1',
      direct_share_path: null,
    },
    {
      folder_id: 'gallery-2',
      folder_name: '3eds',
      photo_count: 3,
      route_path: '/share/abc123/galleries/gallery-2',
      direct_share_path: null,
    },
  ],
};

const mockProjectGallery = {
  ...mockPublicGallery,
  gallery_name: 'Photos',
  project_id: 'project-1',
  project_name: 'Wedding Weekend',
  total_size_bytes: 1024,
  parent_share_id: 'abc123',
  project_navigation: mockProjectShare,
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
    downloadSharedGalleryZip: vi.fn(),
    downloadSharedProjectGalleryZip: vi.fn(),
    unlockSharedGallery: vi.fn(),
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

const fillInput = (input: HTMLElement, value: string) => {
  fireEvent.change(input, { target: { value } });
};

describe('PublicGalleryPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    mockRouteParams = { shareId: 'abc123' };
    window.localStorage.clear();
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { shareLinkService } = await import('../../services/shareLinkService');
    vi.mocked(shareLinkService.getSharedGallery).mockResolvedValue(mockPublicGallery);
    vi.mocked(shareLinkService.downloadSharedGalleryZip).mockResolvedValue(undefined as any);
    vi.mocked(shareLinkService.downloadSharedProjectGalleryZip).mockResolvedValue(undefined as any);
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
    const downloadButton = screen.getByRole('button', { name: /download all photos/i });
    const sizeLabel = screen.getByText('Estimated ZIP size: 1.5 KB');
    expect(downloadButton).toBeInTheDocument();
    expect(sizeLabel).toBeInTheDocument();
    expect(downloadButton).toHaveAttribute('aria-describedby', sizeLabel.id);
    // Photos rendered
    const thumbs = screen.getAllByTestId('public-batch');
    expect(thumbs).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /finish selection/i })).not.toBeInTheDocument();
    expect(document.getElementById('gallery-content')).toBeInTheDocument();
  });

  it('does not render a ZIP size estimate when the payload omits the total', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    vi.mocked(shareLinkService.getSharedGallery).mockResolvedValue({
      ...mockPublicGallery,
      total_size_bytes: undefined,
    } as any);

    render(wrapper());

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /download all photos/i })).toBeInTheDocument();
    });

    expect(screen.queryByText('Estimated ZIP size: 0 B')).not.toBeInTheDocument();
    expect(screen.queryByText(/Estimated ZIP size:/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download all photos/i })).not.toHaveAttribute(
      'aria-describedby',
    );
  });

  it('starts favorites from the corner heart without the redundant helper panel', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
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

    render(wrapper());

    await waitFor(() => {
      expect(screen.getByText('Photos')).toBeInTheDocument();
    });

    expect(
      screen.queryByText(
        'Use the heart button on a photo to start building a shortlist for the photographer.',
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open selection panel/i })).not.toBeInTheDocument();

    const firstCard = screen.getAllByTestId('public-batch')[0];
    const favoriteButton = within(firstCard).getByRole('button', {
      name: /add 1.jpg to favorites/i,
    });

    await userEvent.click(favoriteButton);

    expect(await screen.findByRole('heading', { name: /start selection/i })).toBeInTheDocument();
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

  it('prompts for password on public 401 and retries after submission', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    vi.mocked(shareLinkService.getSharedGallery)
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce(mockPublicGallery);
    vi.mocked(shareLinkService.unlockSharedGallery).mockResolvedValue(undefined);

    render(wrapper());

    await waitFor(() => expect(screen.getByText('Password required')).toBeInTheDocument());
    fillInput(screen.getByLabelText(/share password/i), 'client-pass');
    await userEvent.click(screen.getByRole('button', { name: /unlock share/i }));

    expect(shareLinkService.unlockSharedGallery).toHaveBeenCalledWith('abc123', 'client-pass');
    await waitFor(() => expect(screen.getByText('Photos')).toBeInTheDocument());
  });

  it('keeps the password prompt open when unlock is rejected', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    vi.mocked(shareLinkService.getSharedGallery).mockRejectedValueOnce({
      response: { status: 401 },
    });
    vi.mocked(shareLinkService.unlockSharedGallery).mockRejectedValueOnce({
      response: { status: 401 },
    });

    render(wrapper());

    await waitFor(() => expect(screen.getByText('Password required')).toBeInTheDocument());
    fillInput(screen.getByLabelText(/share password/i), 'wrong-pass');
    await userEvent.click(screen.getByRole('button', { name: /unlock share/i }));

    await waitFor(() =>
      expect(shareLinkService.unlockSharedGallery).toHaveBeenCalledWith('abc123', 'wrong-pass'),
    );
    expect(screen.getByText(/Password is required or incorrect/i)).toBeInTheDocument();
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

  it('uses header-capable share link service when Download All is clicked', async () => {
    render(wrapper());

    await waitFor(() => {
      expect(screen.getByText('Photos')).toBeInTheDocument();
      expect(screen.getByText('(2)')).toBeInTheDocument();
    });

    const btn = screen.getByRole('button', { name: /download all photos/i });
    await userEvent.click(btn);

    const { shareLinkService } = await import('../../services/shareLinkService');
    expect(shareLinkService.downloadSharedGalleryZip).toHaveBeenCalledWith('abc123');
  });

  it('redirects project shares to the first visible gallery by default', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    vi.mocked(shareLinkService.getSharedGallery).mockResolvedValue(mockProjectShare as any);

    render(wrapper());

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/share/abc123/galleries/gallery-1', {
        replace: true,
        state: { skipProjectViewCount: true },
      });
    });
  });

  it('renders a horizontal project gallery list without preview cards', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    mockRouteParams = { shareId: 'abc123', galleryId: 'gallery-2' };
    vi.mocked(shareLinkService.getSharedGallery).mockImplementation(async (_shareId, options) => {
      if (options?.galleryId) {
        return { ...mockProjectGallery, gallery_name: '3eds' } as any;
      }
      return mockProjectShare as any;
    });

    const { container } = render(wrapper());

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Photos' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '3eds' })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Wedding Weekend' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: '3eds' })).not.toBeInTheDocument();
    const galleryDownloadButton = screen.getByRole('button', { name: /download gallery/i });
    const projectDownloadButton = screen.getByRole('button', { name: /download project/i });
    const gallerySizeLabel = screen.getByText('Estimated ZIP size: 1 KB');
    const projectSizeLabel = screen.getByText('Estimated ZIP size: 4 KB');
    expect(galleryDownloadButton).toBeInTheDocument();
    expect(projectDownloadButton).toBeInTheDocument();
    expect(gallerySizeLabel).toBeInTheDocument();
    expect(projectSizeLabel).toBeInTheDocument();
    expect(galleryDownloadButton).toHaveAttribute('aria-describedby', gallerySizeLabel.id);
    expect(projectDownloadButton).toHaveAttribute('aria-describedby', projectSizeLabel.id);
    expect(screen.queryByText('Download visible folders')).not.toBeInTheDocument();
    expect(container.querySelector('img[src="/full/project-cover.jpg"]')).not.toBeNull();
  });

  it('downloads only the active gallery from project share navigation', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    mockRouteParams = { shareId: 'abc123', galleryId: 'gallery-2' };
    vi.mocked(shareLinkService.getSharedGallery).mockResolvedValue({
      ...mockProjectGallery,
      gallery_name: '3eds',
    } as any);

    render(wrapper());

    const button = await screen.findByRole('button', { name: /download gallery/i });
    await userEvent.click(button);

    expect(shareLinkService.downloadSharedProjectGalleryZip).toHaveBeenCalledWith(
      'abc123',
      'gallery-2',
    );
  });

  it('prompts for password again when a ZIP download loses share access', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    vi.mocked(shareLinkService.downloadSharedGalleryZip).mockRejectedValueOnce(
      new ApiError(401, 'ShareLink password required'),
    );

    render(wrapper());

    const button = await screen.findByRole('button', { name: /download all photos/i });
    await userEvent.click(button);

    expect(await screen.findByRole('heading', { name: /password required/i })).toBeInTheDocument();
    expect(
      screen.getByText('Password is required or incorrect. Please try again.'),
    ).toBeInTheDocument();
  });

  it('shows the expired state when a ZIP download reports an expired share', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    vi.mocked(shareLinkService.downloadSharedGalleryZip).mockRejectedValueOnce(
      new ApiError(410, 'ShareLink expired'),
    );

    render(wrapper());

    const button = await screen.findByRole('button', { name: /download all photos/i });
    await userEvent.click(button);

    expect(await screen.findByText(/link has expired/i)).toBeInTheDocument();
  });

  it('reuses nested gallery project navigation without refetching the root project share', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    mockRouteParams = { shareId: 'abc123', galleryId: 'gallery-1' };
    let resolveGallerySwitch: (value: any) => void = () => {};
    const gallerySwitchPromise = new Promise<any>((resolve) => {
      resolveGallerySwitch = resolve;
    });

    vi.mocked(shareLinkService.getSharedGallery).mockImplementation(async (_shareId, options) => {
      if (options?.galleryId === 'gallery-2') {
        return gallerySwitchPromise;
      }
      if (options?.galleryId) {
        return mockProjectGallery as any;
      }
      throw new Error('root project share should not be refetched');
    });

    const { rerender } = render(wrapper());

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Photos' })).toBeInTheDocument();
    });

    const getRootProjectCalls = () =>
      vi
        .mocked(shareLinkService.getSharedGallery)
        .mock.calls.filter(([, options]) => !options?.galleryId).length;

    expect(getRootProjectCalls()).toBe(0);

    mockRouteParams = { shareId: 'abc123', galleryId: 'gallery-2' };
    rerender(wrapper());

    await waitFor(() => {
      expect(screen.getByText('Loading gallery photos...')).toBeInTheDocument();
    });
    expect(screen.queryByRole('status', { name: /loading gallery/i })).not.toBeInTheDocument();

    resolveGallerySwitch({
      ...mockProjectGallery,
      gallery_name: '3eds',
      project_navigation: {
        ...mockProjectShare,
        folders: mockProjectShare.folders,
      },
    });

    await waitFor(() => {
      expect(screen.queryByText('Loading gallery photos...')).not.toBeInTheDocument();
    });

    expect(getRootProjectCalls()).toBe(0);
  });

  it('shows the sticky project selection bar only after selection starts and the hero is passed', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    mockRouteParams = { shareId: 'abc123', galleryId: 'gallery-1' };
    vi.mocked(shareLinkService.getSharedGallery).mockImplementation(async (_shareId, options) => {
      if (options?.galleryId) {
        return mockProjectGallery as any;
      }
      return mockProjectShare as any;
    });
    vi.mocked(shareLinkService.getPublicSelectionConfig).mockResolvedValue({
      is_enabled: true,
      list_title: 'Selected photos',
      limit_enabled: true,
      limit_value: 12,
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
      selected_count: 4,
      submitted_at: null,
      last_activity_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resume_token: 'resume-token',
      items: [],
    } as any);
    window.localStorage.setItem('viewport-selection-resume-abc123', 'resume-token');

    render(wrapper());

    await waitFor(() => {
      expect(screen.queryByText('Loading gallery photos...')).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId('project-selection-sticky-bar')).not.toBeInTheDocument();

    Object.defineProperty(window, 'scrollY', { value: 500, writable: true, configurable: true });
    fireEvent.scroll(window);

    const stickyBar = await screen.findByTestId('project-selection-sticky-bar');
    expect(within(stickyBar).getByText('4 selected')).toBeInTheDocument();
    expect(within(stickyBar).getByRole('button', { name: /open favorites/i })).toBeInTheDocument();
    expect(
      within(stickyBar).getByRole('button', { name: /finish selection/i }),
    ).toBeInTheDocument();
  });

  it('does not show the sticky project selection bar before a selection session starts', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    mockRouteParams = { shareId: 'abc123', galleryId: 'gallery-1' };
    vi.mocked(shareLinkService.getSharedGallery).mockImplementation(async (_shareId, options) => {
      if (options?.galleryId) {
        return mockProjectGallery as any;
      }
      return mockProjectShare as any;
    });
    vi.mocked(shareLinkService.getPublicSelectionConfig).mockResolvedValue({
      is_enabled: true,
      list_title: 'Selected photos',
      limit_enabled: true,
      limit_value: 12,
      allow_photo_comments: false,
      require_name: true,
      require_email: false,
      require_phone: false,
      require_client_note: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);
    vi.mocked(shareLinkService.getPublicSelectionSession).mockRejectedValue({
      response: { status: 404, data: { detail: 'Selection session not found' } },
    } as any);

    render(wrapper());

    await waitFor(() => {
      expect(screen.queryByText('Loading gallery photos...')).not.toBeInTheDocument();
    });
    Object.defineProperty(window, 'scrollY', { value: 500, writable: true, configurable: true });
    fireEvent.scroll(window);

    expect(screen.queryByTestId('project-selection-sticky-bar')).not.toBeInTheDocument();
  });

  it('submits the start selection modal with Enter from the name field', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    const user = userEvent.setup();
    const createdSession = {
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
    };
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
    vi.mocked(shareLinkService.startPublicSelectionSession).mockResolvedValue(
      createdSession as any,
    );
    vi.mocked(shareLinkService.togglePublicSelectionItem).mockResolvedValue(undefined as any);
    vi.mocked(shareLinkService.getPublicSelectionSession).mockResolvedValue(createdSession as any);

    render(wrapper());

    const favoriteButton = await screen.findByRole('button', { name: /add 1.jpg to favorites/i });
    await user.click(favoriteButton);
    const nameInput = await screen.findByLabelText(/your name/i);

    await user.type(nameInput, 'Jane Client{enter}');

    await waitFor(() => {
      expect(shareLinkService.startPublicSelectionSession).toHaveBeenCalledWith('abc123', {
        client_name: 'Jane Client',
        client_email: null,
        client_phone: null,
        client_note: null,
      });
    });
  });

  it('shows a compact note trigger for selected photos instead of placing comments in the grid', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService');
    vi.mocked(shareLinkService.getPublicSelectionConfig).mockResolvedValue({
      is_enabled: true,
      list_title: 'Selected photos',
      limit_enabled: false,
      limit_value: null,
      allow_photo_comments: true,
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
    window.localStorage.setItem('viewport-selection-resume-abc123', 'resume-token');

    render(wrapper());

    await waitFor(() => {
      expect(screen.getByLabelText(/remove 1.jpg from favorites/i)).toBeInTheDocument();
    });

    const noteButton = screen.getByLabelText(/add a note for 1.jpg/i);
    expect(noteButton).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Comment for this photo')).not.toBeInTheDocument();

    fireEvent.click(noteButton);

    const commentInput = await screen.findByPlaceholderText('Comment for this photo');
    expect(commentInput).toHaveFocus();
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
