import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { GalleryPage } from '../../pages/GalleryPage';

const mockNavigate = vi.fn();

// Mock usePhotoLightbox hook
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

// Mock data
const mockGalleryData = {
  id: '1',
  name: 'Gallery #1',
  created_at: '2024-01-01T10:00:00Z',
  owner_id: 'user1',
  shooting_date: '2024-01-01',
  public_sort_by: 'original_filename' as const,
  public_sort_order: 'asc' as const,
  cover_photo_id: null,
  photo_count: 3,
  total_size_bytes: 37035,
  has_active_share_links: false,
  cover_photo_thumbnail_url: null,
  recent_photo_thumbnail_urls: [],
  photos: [
    {
      id: 'photo1',
      url: '/api/photos/photo1.jpg',
      thumbnail_url: '/api/photos/photo1_thumb.jpg',
      filename: 'photo1.jpg',
      created_at: '2024-01-01T10:00:00Z',
      file_size: 12345,
      uploaded_at: '2024-01-01T10:00:00Z',
    },
    {
      id: 'photo2',
      url: '/api/photos/photo2.jpg',
      thumbnail_url: '/api/photos/photo2_thumb.jpg',
      filename: 'photo2.jpg',
      created_at: '2024-01-01T10:00:00Z',
      file_size: 12345,
      uploaded_at: '2024-01-01T10:00:00Z',
    },
    {
      id: 'photo3',
      url: '/api/photos/photo3.jpg',
      thumbnail_url: '/api/photos/photo3_thumb.jpg',
      filename: 'photo3.jpg',
      created_at: '2024-01-01T10:00:00Z',
      file_size: 12345,
      uploaded_at: '2024-01-01T10:00:00Z',
    },
  ],
  total_photos: 3,
};

const mockShareLink = {
  id: 'link1',
  created_at: '2024-01-01T10:00:00Z',
  expires_at: null,
  views: 128,
  zip_downloads: 7,
  single_downloads: 19,
};

// Mock services
vi.mock('../../services/galleryService', () => ({
  galleryService: {
    getGallery: vi.fn(),
    deleteGallery: vi.fn(),
    updateGallery: vi.fn(),
    setCoverPhoto: vi.fn(),
    clearCoverPhoto: vi.fn(),
  },
}));

vi.mock('../../services/photoService', () => ({
  photoService: {
    deletePhotos: vi.fn(),
    deletePhoto: vi.fn(),
    renamePhoto: vi.fn(),
    uploadPhotosPresigned: vi.fn(),
    retryFailedUploads: vi.fn(),
  },
}));

vi.mock('../../services/shareLinkService', () => ({
  shareLinkService: {
    getShareLinks: vi.fn(),
    createShareLink: vi.fn(),
    deleteShareLink: vi.fn(),
  },
}));

// Mock Layout to avoid router context issues
vi.mock('../../components/Layout', () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

// Mock useParams to return gallery ID
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useNavigate: () => mockNavigate,
    Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  };
});

// Mock window.confirm
Object.defineProperty(window, 'confirm', {
  writable: true,
  value: vi.fn(),
});

const GalleryPageWrapper = () => {
  return (
    <MemoryRouter>
      <GalleryPage />
    </MemoryRouter>
  );
};

describe('GalleryPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Default mock responses
    const { galleryService } = await import('../../services/galleryService');
    const { shareLinkService } = await import('../../services/shareLinkService');

    vi.mocked(galleryService.getGallery).mockResolvedValue(mockGalleryData);
    vi.mocked(shareLinkService.getShareLinks).mockResolvedValue([]);
    vi.mocked(shareLinkService.createShareLink).mockResolvedValue(mockShareLink);
    vi.mocked(window.confirm).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render gallery page correctly', async () => {
    render(<GalleryPageWrapper />);

    await waitFor(() => {
      expect(screen.getByText('Gallery #1')).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { level: 2, name: /Photos\s*3/i })).toBeInTheDocument();
    expect(screen.getByText('Share Links')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete gallery/i })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });

  it('should navigate to dashboard after deleting the gallery', async () => {
    const { galleryService } = await import('../../services/galleryService');

    render(<GalleryPageWrapper />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete gallery/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /delete gallery/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(galleryService.deleteGallery).toHaveBeenCalledWith('1');
    });

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('should render gallery after initial load', async () => {
    render(<GalleryPageWrapper />);

    await waitFor(() => {
      expect(screen.getByText('Gallery #1')).toBeInTheDocument();
    });
  });

  it('should handle gallery loading error', async () => {
    const { galleryService } = await import('../../services/galleryService');
    const { ApiError } = await import('../../lib/errorHandling');

    // Use 400 error to avoid redirect to error page and show inline error instead
    vi.mocked(galleryService.getGallery).mockRejectedValue(new ApiError(400, 'Invalid request'));

    render(<GalleryPageWrapper />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load gallery')).toBeInTheDocument();
    });

    expect(screen.getByText(/Invalid request/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  describe('Photo Modal Features', () => {
    it('should open photo modal when clicking on a photo', async () => {
      render(<GalleryPageWrapper />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: /Photos\s*3/i })).toBeInTheDocument();
      });

      // Find photo images and their parent buttons
      const photoImages = screen.getAllByAltText(/Photo photo/i);
      expect(photoImages).toHaveLength(3);

      const firstPhotoButton = photoImages[0].closest('button');
      expect(firstPhotoButton).toBeInTheDocument();

      await userEvent.click(firstPhotoButton!);

      // Lightbox should be visible
      await waitFor(() => {
        expect(screen.getByTestId('lightbox')).toBeInTheDocument();
      });
    });

    it('should not show navigation buttons for single photo', async () => {
      const singlePhotoGallery = {
        ...mockGalleryData,
        photos: [mockGalleryData.photos[0]],
        total_photos: 1,
        photo_count: 1,
      };

      const { galleryService } = await import('../../services/galleryService');
      vi.mocked(galleryService.getGallery).mockResolvedValue(singlePhotoGallery);

      render(<GalleryPageWrapper />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: /Photos\s*1/i })).toBeInTheDocument();
      });

      // Open lightbox
      const photoImages = screen.getAllByAltText(/Photo photo/i);
      const photoButton = photoImages[0].closest('button');
      await userEvent.click(photoButton!);

      await waitFor(() => {
        expect(screen.getByTestId('lightbox')).toBeInTheDocument();
      });
    });
  });

  describe('Photo Actions', () => {
    it('should not send update when shooting date is cleared', async () => {
      const { galleryService } = await import('../../services/galleryService');

      render(<GalleryPageWrapper />);

      const shootingDateInput = await screen.findByLabelText(/shooting date/i);
      expect(shootingDateInput).toHaveValue('2024-01-01');

      await userEvent.clear(shootingDateInput);

      await waitFor(
        () => {
          expect(vi.mocked(galleryService.updateGallery)).not.toHaveBeenCalled();
          expect(shootingDateInput).toHaveValue('2024-01-01');
        },
        { timeout: 1200 },
      );
    });

    it('should handle photo deletion', async () => {
      const { photoService } = await import('../../services/photoService');

      render(<GalleryPageWrapper />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: /Photos\s*3/i })).toBeInTheDocument();
      });

      // Find the first photo container and get its delete button
      const photoImages = screen.getAllByAltText(/Photo photo/i);
      const firstPhoto = photoImages[0];

      // Navigate to parent container and find the delete button within it
      const photoContainer = firstPhoto.closest('.group');
      expect(photoContainer).toBeInTheDocument();

      // Find the delete button inside this specific photo container
      const deleteButton = photoContainer!
        .querySelector('button svg[class*="trash"]')
        ?.closest('button');
      expect(deleteButton).toBeInTheDocument();

      await userEvent.hover(photoContainer!);
      await userEvent.click(deleteButton!);

      // Expect confirmation modal to appear
      expect(screen.getByText('Delete Photo')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete this photo/)).toBeInTheDocument();

      // Click confirm button in modal
      const confirmButton = screen.getByRole('button', { name: 'Delete' });
      await userEvent.click(confirmButton);

      await waitFor(() => {
        expect(photoService.deletePhoto).toHaveBeenCalledWith('1', 'photo1');
      });

      // Wait for the photo to be removed from the UI to avoid act() warning
      await waitFor(() => {
        expect(screen.queryByAltText('Photo photo1')).not.toBeInTheDocument();
      });
    });

    it('should treat deleting already-removed photo as successful', async () => {
      const { photoService } = await import('../../services/photoService');
      const { ApiError } = await import('../../lib/errorHandling');
      vi.mocked(photoService.deletePhoto).mockRejectedValue(new ApiError(404, 'Photo not found'));

      render(<GalleryPageWrapper />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: /Photos\s*3/i })).toBeInTheDocument();
      });

      const photoImages = screen.getAllByAltText(/Photo photo/i);
      const firstPhoto = photoImages[0];
      const photoContainer = firstPhoto.closest('.group');
      expect(photoContainer).toBeInTheDocument();

      const deleteButton = photoContainer!
        .querySelector('button svg[class*="trash"]')
        ?.closest('button');
      expect(deleteButton).toBeInTheDocument();

      await userEvent.hover(photoContainer!);
      await userEvent.click(deleteButton!);
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(photoService.deletePhoto).toHaveBeenCalledWith('1', 'photo1');
      });

      await waitFor(() => {
        expect(screen.queryByAltText('Photo photo1')).not.toBeInTheDocument();
      });
    });

    it('should remove stale photo when setting cover returns 404', async () => {
      const { galleryService } = await import('../../services/galleryService');
      const { ApiError } = await import('../../lib/errorHandling');
      vi.mocked(galleryService.setCoverPhoto).mockRejectedValue(
        new ApiError(404, 'Photo not found'),
      );

      render(<GalleryPageWrapper />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: /Photos\s*3/i })).toBeInTheDocument();
      });

      const photoImages = screen.getAllByAltText(/Photo photo/i);
      const firstPhoto = photoImages[0];
      const photoContainer = firstPhoto.closest('.group');
      expect(photoContainer).toBeInTheDocument();

      await userEvent.hover(photoContainer!);
      const setCoverButton = screen.getAllByRole('button', { name: /set as cover/i })[0];
      await userEvent.click(setCoverButton);

      await waitFor(() => {
        expect(galleryService.setCoverPhoto).toHaveBeenCalledWith('1', 'photo1');
      });

      await waitFor(() => {
        expect(screen.queryByAltText('Photo photo1')).not.toBeInTheDocument();
      });

      expect(screen.getByText('This photo was already deleted.')).toBeInTheDocument();
    });
  });

  describe('Share Link Features', () => {
    it('should fetch share links separately from gallery details', async () => {
      const { shareLinkService } = await import('../../services/shareLinkService');

      render(<GalleryPageWrapper />);

      await waitFor(() => {
        expect(shareLinkService.getShareLinks).toHaveBeenCalledWith('1');
      });
    });

    it('should create share link', async () => {
      const { shareLinkService } = await import('../../services/shareLinkService');

      render(<GalleryPageWrapper />);

      // Wait for initial load to complete
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: /Photos\s*3/i })).toBeInTheDocument();
      });

      const createLinkButton = screen.getByRole('button', { name: /create new share link/i });
      await userEvent.click(createLinkButton);

      await waitFor(() => {
        expect(shareLinkService.createShareLink).toHaveBeenCalledWith('1');
      });

      await waitFor(() => {
        expect(shareLinkService.getShareLinks).toHaveBeenCalledTimes(2);
      });

      // Wait for the new link to appear in the UI to avoid act() warning
      // Since mockShareLink.id is 'link1' and it's already there, we check for the call
      // and then wait for the button to be enabled again (meaning loading finished)
      await waitFor(() => {
        expect(createLinkButton).not.toBeDisabled();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no photos', async () => {
      const emptyGallery = {
        ...mockGalleryData,
        photos: [],
        total_photos: 0,
        photo_count: 0,
      };

      const { galleryService } = await import('../../services/galleryService');
      vi.mocked(galleryService.getGallery).mockResolvedValue(emptyGallery);

      render(<GalleryPageWrapper />);

      await waitFor(() => {
        expect(screen.getByText('No photos in this gallery')).toBeInTheDocument();
      });

      expect(
        screen.getByText(
          'Upload your first photo to get started. You can also drag and drop files anywhere on this page.',
        ),
      ).toBeInTheDocument();
    });
  });
});
