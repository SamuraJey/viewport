import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGalleryActions } from '../../hooks/useGalleryActions';
import { galleryService } from '../../services/galleryService';
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

  it('keeps the returned cover thumbnail when setting a cover photo', async () => {
    const updatedGallery: Gallery = {
      ...baseGallery,
      cover_photo_id: 'photo-2',
      cover_photo_thumbnail_url: '/photos/photo-2-thumb-presigned.jpg',
    };
    vi.mocked(galleryService.setCoverPhoto).mockResolvedValue(updatedGallery);

    const { result } = renderHook(
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
});
