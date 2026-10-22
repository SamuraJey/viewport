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
    requestPublicationPhotos: vi.fn(),
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
    vi.mocked(photoService.downloadGalleryZip).mockReset();
    vi.mocked(photoService.downloadSelectedPhotosZip).mockReset();
    vi.mocked(photoService.downloadPhoto).mockReset();
    vi.mocked(photoService.requestPublicationPhotos).mockReset();
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

  it('ignores late responses from an earlier page and keeps the newest loading state', async () => {
    let resolveFirst!: (data: GalleryDetail) => void;
    vi.mocked(galleryService.getGallery)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce({ ...baseGallery, photos: [photos[1]] });
    const { result } = renderUseGalleryActions();
    let first!: Promise<void>;
    act(() => {
      first = result.current.fetchGalleryDetails(1, true, true);
    });
    await act(async () => {
      await result.current.fetchGalleryDetails(2, false, true);
    });
    expect(result.current.photoUrls).toEqual([photos[1]]);
    expect(result.current.isInitialLoading).toBe(false);
    await act(async () => {
      resolveFirst(baseGallery);
      await first;
    });
    expect(result.current.photoUrls).toEqual([photos[1]]);
    expect(result.current.isLoadingPhotos).toBe(false);
  });

  it('publishes the unfiltered total when a rotation refresh supersedes clearing search', async () => {
    const setTotal = vi.fn();
    const { result, rerender } = renderHook(
      ({ search }: { search?: string }) =>
        useGalleryActions({
          galleryId: 'gallery-1',
          filters: { search, sort_by: 'original_filename', order: 'asc' },
          pagination: { page: 1, pageSize: 100, setTotal },
        }),
      {
        initialProps: { search: 'photo' },
        wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
      },
    );
    const filtered = { ...baseGallery, total_photos: 5 };
    vi.mocked(galleryService.getGallery).mockResolvedValueOnce(filtered);
    await act(async () => {
      await result.current.fetchGalleryDetails(1, true);
    });
    expect(setTotal).toHaveBeenLastCalledWith(5);
    rerender({ search: undefined });
    let resolveForeground!: (data: GalleryDetail) => void;
    const unfiltered = { ...baseGallery, total_photos: 300, shooting_date: '2026-03-02' };
    vi.mocked(galleryService.getGallery)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveForeground = resolve;
        }),
      )
      .mockResolvedValueOnce(unfiltered);
    let foreground!: Promise<void>;
    act(() => {
      foreground = result.current.fetchGalleryDetails(1);
    });
    await act(async () => {
      await result.current.refreshAfterRotation();
    });
    await act(async () => {
      resolveForeground(unfiltered);
      await foreground;
    });
    expect(result.current.gallery?.total_photos).toBe(300);
    expect(setTotal).toHaveBeenLastCalledWith(300);
    expect(result.current.shootingDateInput).toBe('2026-03-02');
    expect(result.current.isLoadingPhotos).toBe(false);
  });

  it('reports a failed rotation replacement and releases foreground loading', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { result } = renderUseGalleryActions();
      await act(async () => {
        await result.current.fetchGalleryDetails(1, true);
      });
      let resolveForeground!: (data: GalleryDetail) => void;
      vi.mocked(galleryService.getGallery)
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveForeground = resolve;
          }),
        )
        .mockRejectedValueOnce(new ApiError(400, 'Rotation refresh failed'));
      let foreground!: Promise<void>;
      act(() => {
        foreground = result.current.fetchGalleryDetails(1);
      });
      expect(result.current.isLoadingPhotos).toBe(true);
      await act(async () => {
        await result.current.refreshAfterRotation().catch(() => {});
      });
      await act(async () => {
        resolveForeground(baseGallery);
        await foreground;
      });
      expect(result.current.isLoadingPhotos).toBe(false);
      expect(result.current.error).toBeTruthy();
      expect(errorLog).toHaveBeenCalledExactlyOnceWith('Error handled:', expect.any(ApiError));
    } finally {
      errorLog.mockRestore();
    }
  });

  it('does not let a failed rotation refresh finish or fail a newer foreground request', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { result } = renderUseGalleryActions();
      await act(async () => {
        await result.current.fetchGalleryDetails(1, true);
      });
      let rejectRotation!: (error: Error) => void;
      let resolveForeground!: (data: GalleryDetail) => void;
      vi.mocked(galleryService.getGallery)
        .mockReturnValueOnce(
          new Promise((_resolve, reject) => {
            rejectRotation = reject;
          }),
        )
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveForeground = resolve;
          }),
        );
      let rotation!: Promise<void>;
      let foreground!: Promise<void>;
      act(() => {
        rotation = result.current.refreshAfterRotation().catch(() => {});
      });
      act(() => {
        foreground = result.current.fetchGalleryDetails(2);
      });
      await act(async () => {
        rejectRotation(new ApiError(400, 'Old request failed'));
        await rotation;
      });
      expect(result.current.isLoadingPhotos).toBe(true);
      expect(result.current.error).toBeNull();
      await act(async () => {
        resolveForeground({ ...baseGallery, photos: [photos[1]] });
        await foreground;
      });
      expect(result.current.isLoadingPhotos).toBe(false);
      expect(result.current.photoUrls).toEqual([photos[1]]);
      expect(errorLog).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it('invalidates cached pages after rename and upload, and reuses them between page clicks', async () => {
    const { result } = renderUseGalleryActions();
    await act(async () => {
      await result.current.fetchGalleryDetails(1, true, true);
    });
    await act(async () => {
      await result.current.fetchGalleryDetails(1, false, true);
    });
    expect(galleryService.getGallery).toHaveBeenCalledTimes(1);
    act(() => result.current.handleRenamePhoto('photo-1', 'photo-1.jpg'));
    vi.mocked(photoService.renamePhoto).mockResolvedValue({
      ...photos[0],
      filename: 'renamed.jpg',
      gallery_id: 'gallery-1',
      media_type: 'image',
      status: 'successful',
    });
    await act(async () => {
      await result.current.handleRenameConfirm('renamed.jpg');
    });
    await act(async () => {
      await result.current.fetchGalleryDetails(1, false, true);
    });
    expect(galleryService.getGallery).toHaveBeenCalledTimes(2);
    await act(async () => {
      await result.current.handleUploadComplete({
        total_files: 1,
        successful_uploads: 1,
        failed_uploads: 0,
        results: [],
      });
    });
    expect(galleryService.getGallery).toHaveBeenCalledTimes(3);
  });

  it('retries a read invalidated by a cover write instead of restoring the previous cover', async () => {
    const { result } = renderUseGalleryActions();
    await act(async () => {
      await result.current.fetchGalleryDetails(1, true, true);
    });
    let resolveRead!: (data: GalleryDetail) => void;
    const updated = { ...baseGallery, cover_photo_id: 'photo-2' };
    vi.mocked(galleryService.getGallery)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      )
      .mockResolvedValue(updated);
    vi.mocked(galleryService.setCoverPhoto).mockResolvedValue(updated);
    let refresh!: Promise<void>;
    act(() => {
      refresh = result.current.fetchGalleryDetails(1);
    });
    await act(async () => {
      await result.current.handleSetCover('photo-2');
    });
    await act(async () => {
      resolveRead(baseGallery);
      await refresh;
    });
    expect(result.current.gallery?.cover_photo_id).toBe('photo-2');
    expect(result.current.isLoadingPhotos).toBe(false);
    expect(galleryService.getGallery).toHaveBeenCalledTimes(3);
  });

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
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
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
      expect(errorLog).toHaveBeenCalledExactlyOnceWith('Error handled:', expect.any(ApiError));
    } finally {
      errorLog.mockRestore();
    }
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
  it.each(['all', 'selected', 'photo'] as const)(
    'reports and rethrows a rejected %s download so the chooser stays open',
    async (kind) => {
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      const failure = new ApiError(409, 'Publication files are not ready');
      vi.mocked(photoService.downloadGalleryZip).mockRejectedValueOnce(failure);
      vi.mocked(photoService.downloadSelectedPhotosZip).mockRejectedValueOnce(failure);
      vi.mocked(photoService.downloadPhoto).mockRejectedValueOnce(failure);
      const { result } = renderUseGalleryActions();
      const options = { quality: 'publication', includeVideos: false } as const;
      try {
        await act(async () => {
          const download = kind === 'all'
            ? result.current.handleDownloadGallery(options)
            : kind === 'selected'
              ? result.current.handleDownloadSelectedPhotos(new Set(['photo-1']), options)
              : result.current.handleDownloadPhoto('photo-1', options);
          await expect(download).rejects.toBe(failure);
        });
        expect(toastMock.error).toHaveBeenCalledWith('Publication files are not ready');
        expect(toastMock.success).not.toHaveBeenCalled();
      } finally {
        errorLog.mockRestore();
      }
    },
  );
  it('keeps server download failures inline instead of navigating away from the chooser', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new ApiError(500, 'Storage temporarily unavailable');
    vi.mocked(photoService.downloadPhoto).mockRejectedValueOnce(failure);
    const { result } = renderUseGalleryActions();
    try {
      await act(async () => {
        await expect(result.current.handleDownloadPhoto('photo-1', {
          quality: 'original', includeVideos: true,
        })).rejects.toBe(failure);
      });
      expect(result.current.error).toBe('Server error. Please try again later.');
      expect(toastMock.success).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it('requests publication files after confirmation and refreshes gallery details with counts', async () => {
    vi.mocked(photoService.requestPublicationPhotos).mockResolvedValue({
      requested_count: 2, skipped_count: 1,
    });
    const { result } = renderUseGalleryActions();
    act(() => {
      result.current.handleRequestPublication();
    });
    expect(photoService.requestPublicationPhotos).not.toHaveBeenCalled();
    expect(result.current.isConfirmationOpen).toBe(true);
    await act(async () => {
      await result.current.handleRequestPublicationConfirm();
    });
    expect(photoService.requestPublicationPhotos).toHaveBeenCalledWith('gallery-1');
    expect(toastMock.success).toHaveBeenCalledWith(
      'Preparing 2 photos for publishing; 1 already prepared',
    );
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('reports already prepared photos when the response confirms prepared files', async () => {
    vi.mocked(photoService.requestPublicationPhotos).mockResolvedValueOnce({
      requested_count: 0, skipped_count: 2,
    });
    const { result } = renderUseGalleryActions();
    act(() => {
      result.current.handleRequestPublication();
    });
    await act(async () => {
      await result.current.handleRequestPublicationConfirm();
    });
    expect(toastMock.info).toHaveBeenCalledWith('All photos are already prepared for publishing');
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(result.current.error).toBeFalsy();
    expect(result.current.isPreparingPublication).toBe(false);
  });

  it.each([
    ['empty', []],
    ['video-only', photos.map((photo) => ({ ...photo, media_type: 'video' as const }))],
    ['pending rotations', photos.map((photo) => ({ ...photo, rotation_status: 'pending' as const }))],
    ['processing rotations', photos.map((photo) => ({ ...photo, rotation_status: 'processing' as const }))],
    ['prepared photos on the loaded page', photos.map((photo) => ({ ...photo, publication_state: 'ready' as const }))],
  ])('does not infer publication readiness from a 404 with %s', async (_scope, scopePhotos) => {
    vi.mocked(galleryService.getGallery).mockResolvedValueOnce({ ...baseGallery, photos: scopePhotos });
    vi.mocked(photoService.requestPublicationPhotos).mockRejectedValueOnce(new ApiError(404, 'No photos found'));
    const { result } = renderUseGalleryActions();
    await act(async () => {
      await result.current.fetchGalleryDetails(1, true, true);
      await result.current.handleRequestPublicationConfirm();
    });
    expect(toastMock.info).toHaveBeenCalledWith('No eligible photos are available for publishing');
    expect(toastMock.info).not.toHaveBeenCalledWith('All photos are already prepared for publishing');
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(result.current.error).toBeFalsy();
    expect(result.current.isPreparingPublication).toBe(false);
  });

  it('reports no eligible photos for a response with zero requested and prepared files', async () => {
    vi.mocked(photoService.requestPublicationPhotos).mockResolvedValueOnce({
      requested_count: 0, skipped_count: 0,
    });
    const { result } = renderUseGalleryActions();
    await act(async () => {
      await result.current.handleRequestPublicationConfirm();
    });
    expect(toastMock.info).toHaveBeenCalledWith('No eligible photos are available for publishing');
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('keeps server publication failures inline without a success toast after confirmation', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new ApiError(500, 'Storage temporarily unavailable');
    vi.mocked(photoService.requestPublicationPhotos).mockRejectedValueOnce(failure);
    const { result } = renderUseGalleryActions();
    try {
      act(() => {
        result.current.handleRequestPublication();
      });
      await act(async () => {
        await expect(result.current.handleRequestPublicationConfirm()).rejects.toBe(failure);
      });
      expect(result.current.error).toBe('Server error. Please try again later.');
      expect(toastMock.error).toHaveBeenCalledWith('Storage temporarily unavailable');
      expect(toastMock.success).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });
});
