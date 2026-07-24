import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGalleryActions } from '../../hooks/useGalleryActions';

const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: toastMock,
}));
import { ApiError } from '../../lib/errorHandling';
import { galleryService } from '../../services/galleryService';
import { photoService } from '../../services/photoService';
import { shareLinkService } from '../../services/shareLinkService';
import type { Gallery, GalleryDetail } from '../../types';

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
    downloadGalleryZip: vi.fn(),
    downloadSelectedPhotosZip: vi.fn(),
    downloadPhoto: vi.fn(),
  },
}));

vi.mock('../../services/shareLinkService', () => ({
  shareLinkService: {
    getShareLinks: vi.fn().mockResolvedValue([]),
    createShareLink: vi.fn(),
    updateShareLink: vi.fn(),
    deleteShareLink: vi.fn(),
  },
}));

const photos = [
  {
    id: 'photo-1',
    url: '/photos/photo-1.jpg',
    thumbnail_url: '/photos/photo-1-thumb.jpg',
    filename: 'photo-1.jpg',
    file_size: 100,
    uploaded_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'photo-2',
    url: '/photos/photo-2.jpg',
    thumbnail_url: '/photos/photo-2-thumb.jpg',
    filename: 'photo-2.jpg',
    file_size: 100,
    uploaded_at: '2026-01-01T00:01:00Z',
  },
];

const baseGallery: GalleryDetail = {
  id: 'gallery-1',
  owner_id: 'user-1',
  project_id: 'project-1',
  project_name: 'Project',
  project_position: 0,
  project_visibility: 'listed',
  name: 'Gallery',
  created_at: '2026-01-01T00:00:00Z',
  shooting_date: '2026-01-01',
  public_sort_by: 'original_filename',
  public_sort_order: 'asc',
  cover_photo_id: 'photo-1',
  photo_count: 2,
  total_size_bytes: 200,
  has_active_share_links: false,
  cover_photo_thumbnail_url: '/photos/photo-1-thumb.jpg',
  cover_focal_x: 50,
  cover_focal_y: 50,
  cover_display_option: 'centered_title',
  public_photo_spacing: 'medium',
  public_color_scheme: 'light',
  photos,
  total_photos: 2,
};

describe('useGalleryActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(galleryService.getGallery).mockResolvedValue(baseGallery);
  });

  const renderUseGalleryActions = () =>
    renderHook(
      () =>
        useGalleryActions({
          galleryId: 'gallery-1',
          parentProjectId: 'project-1',
          filters: {
            sort_by: 'original_filename',
            order: 'asc',
          },
          pagination: {
            page: 1,
            pageSize: 100,
            setTotal: vi.fn(),
          },
        }),
      {
        wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
      },
    );

  it('keeps the returned cover thumbnail when setting a cover photo', async () => {
    const updatedGallery: Gallery = {
      ...baseGallery,
      cover_photo_id: 'photo-2',
      cover_photo_thumbnail_url: '/photos/photo-2-thumb-presigned.jpg',
    };
    vi.mocked(galleryService.setCoverPhoto).mockResolvedValue(updatedGallery);

    const { result } = renderUseGalleryActions();

    await act(async () => {
      await result.current.fetchGalleryDetails(1, true);
    });

    await act(async () => {
      await result.current.handleSetCover('photo-2');
    });

    await waitFor(() => {
      expect(result.current.gallery?.cover_photo_id).toBe('photo-2');
      expect(result.current.gallery?.cover_photo_thumbnail_url).toBe(
        '/photos/photo-2-thumb-presigned.jpg',
      );
      expect(result.current.gallery?.photos).toEqual(photos);
      expect(result.current.gallery?.total_photos).toBe(2);
    });
  });

  it('returns the complete gallery detail when saving appearance settings', async () => {
    const updatedGallery: Gallery = {
      ...baseGallery,
      cover_photo_id: 'photo-2',
      cover_photo_thumbnail_url: '/photos/photo-2-thumb-presigned.jpg',
      cover_focal_x: 24,
      cover_focal_y: 76,
      cover_display_option: 'text_block',
      public_photo_spacing: 'large',
      public_color_scheme: 'dark',
    };
    delete (updatedGallery as Gallery & Partial<GalleryDetail>).photos;
    delete (updatedGallery as Gallery & Partial<GalleryDetail>).total_photos;
    vi.mocked(galleryService.updateGallery).mockResolvedValue(updatedGallery);

    const { result } = renderUseGalleryActions();

    await act(async () => {
      await result.current.fetchGalleryDetails(1, true);
    });

    let savedGallery: GalleryDetail | undefined;
    await act(async () => {
      savedGallery = await result.current.handleSaveAppearanceSettings({
        cover_photo_id: 'photo-2',
        cover_focal_x: 24,
        cover_focal_y: 76,
        cover_display_option: 'text_block',
        public_photo_spacing: 'large',
        public_color_scheme: 'dark',
      });
    });

    expect(savedGallery).toMatchObject({
      id: 'gallery-1',
      cover_photo_id: 'photo-2',
      cover_focal_x: 24,
      cover_focal_y: 76,
      cover_display_option: 'text_block',
      public_photo_spacing: 'large',
      public_color_scheme: 'dark',
      cover_photo_thumbnail_url: '/photos/photo-2-thumb-presigned.jpg',
      total_photos: 2,
    });
    expect(savedGallery?.photos).toEqual(photos);
    expect(result.current.gallery?.photos).toEqual(photos);
    expect(result.current.gallery?.total_photos).toBe(2);
  });

  it('returns a complete fallback gallery when appearance cover save finds a deleted photo', async () => {
    vi.mocked(galleryService.updateGallery).mockRejectedValue(new ApiError(404, 'Photo not found'));

    const { result } = renderUseGalleryActions();

    await act(async () => {
      await result.current.fetchGalleryDetails(1, true);
    });

    let recoveredGallery: GalleryDetail | undefined;
    await act(async () => {
      recoveredGallery = await result.current.handleSaveAppearanceSettings({
        cover_photo_id: 'photo-1',
        cover_focal_x: 42,
      });
    });

    expect(recoveredGallery).toMatchObject({
      id: 'gallery-1',
      name: 'Gallery',
      project_id: 'project-1',
      cover_photo_id: null,
      cover_focal_x: 42,
      cover_photo_thumbnail_url: '/photos/photo-1-thumb.jpg',
      total_photos: 2,
    });
    expect(recoveredGallery?.photos).toEqual(photos);
    expect(result.current.gallery?.cover_photo_id).toBeNull();
    expect(result.current.gallery?.cover_photo_thumbnail_url).toBe('/photos/photo-1-thumb.jpg');
    expect(result.current.actionInfo).toBe('This photo was already deleted.');
  });

  it('shows toast.success on share link creation', async () => {
    vi.mocked(shareLinkService.createShareLink).mockResolvedValue({
      id: 'link-1',
      gallery_id: 'gallery-1',
      label: 'Preview',
      is_active: true,
      expires_at: null,
      views: 0,
      zip_downloads: 0,
      single_downloads: 0,
      created_at: '2026-01-01',
    } as never);

    const { result } = renderUseGalleryActions();

    await act(async () => {
      await result.current.fetchGalleryDetails(1, true);
    });

    await act(async () => {
      await result.current.handleCreateShareLink({ label: 'Preview' });
    });

    expect(toastMock.success).toHaveBeenCalledWith('Share link created');
  });

  it('shows toast.error on share link creation failure', async () => {
    vi.mocked(shareLinkService.createShareLink).mockRejectedValue(
      new ApiError(500, 'Server error'),
    );

    const { result } = renderUseGalleryActions();

    await act(async () => {
      await result.current.fetchGalleryDetails(1, true);
    });

    await act(async () => {
      try {
        await result.current.handleCreateShareLink({ label: 'Preview' });
      } catch {
        // expected — handler rethrows
      }
    });

    expect(toastMock.error).toHaveBeenCalled();
  });

  it('does not fire toast.success on photo rename (modal handles it)', async () => {
    vi.mocked(photoService.renamePhoto).mockResolvedValue({
      id: 'photo-1',
      filename: 'renamed.jpg',
      url: '/photos/renamed.jpg',
      thumbnail_url: '/photos/renamed-thumb.jpg',
    } as never);

    const { result } = renderUseGalleryActions();

    await act(async () => {
      await result.current.fetchGalleryDetails(1, true);
    });

    await act(async () => {
      result.current.handleRenamePhoto('photo-1', 'photo-1.jpg');
    });

    await act(async () => {
      await result.current.handleRenameConfirm('renamed.jpg');
    });

    expect(photoService.renamePhoto).toHaveBeenCalledWith('gallery-1', 'photo-1', 'renamed.jpg');
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});
