import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { photoService } from '../../services/photoService';
import { usePhotoRotation } from '../../hooks/usePhotoRotation';
import type { GalleryPhoto, PhotoRotationResponse } from '../../types/photo';

vi.mock('../../services/photoService', () => ({
  photoService: { rotatePhotos: vi.fn(), getRotationStatus: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const original: GalleryPhoto = {
  id: 'image',
  media_type: 'image',
  status: 'successful',
  filename: 'image.jpg',
  url: 'full',
  thumbnail_url: 'thumb',
  file_size: 100,
  uploaded_at: '',
  rotation: 0,
  requested_rotation: 0,
  rotation_revision: 0,
  rotation_status: 'ready',
};
const response = (photo: GalleryPhoto): PhotoRotationResponse => ({
  results: [{ photo_id: photo.id, photo, error: null }],
  pending_rotation_count: photo.rotation_status === 'ready' ? 0 : 1,
});
const options = (photos = [original]) => ({
  galleryId: 'gallery',
  photos,
  pendingCount: 0,
  onUpdate: vi.fn(),
  onSaved: vi.fn().mockResolvedValue(undefined),
});

describe('usePhotoRotation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces rapid clicks into one absolute, revision-checked edit', async () => {
    vi.mocked(photoService.rotatePhotos).mockResolvedValue(
      response({
        ...original,
        requested_rotation: 180,
        rotation_revision: 1,
        rotation_status: 'pending',
      }),
    );
    const { result } = renderHook(() => usePhotoRotation(options()));
    act(() => {
      result.current.rotate(['image'], 90);
      result.current.rotate(['image'], 90);
    });
    expect(result.current.photos[0].requested_rotation).toBe(180);
    expect(photoService.rotatePhotos).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(photoService.rotatePhotos).toHaveBeenCalledExactlyOnceWith('gallery', [
      { photo_id: 'image', rotation: 180, expected_revision: 0 },
    ]);
    expect(result.current.getPhoto('image')?.rotation_status).toBe('pending');
  });

  it('excludes videos and unfinished images from a mixed selection', async () => {
    const opts = options([
      original,
      { ...original, id: 'video', media_type: 'video' },
      { ...original, id: 'upload', status: 'processing' },
    ]);
    vi.mocked(photoService.rotatePhotos).mockResolvedValue(
      response({
        ...original,
        requested_rotation: 270,
        rotation_revision: 1,
        rotation_status: 'pending',
      }),
    );
    const { result } = renderHook(() => usePhotoRotation(opts));
    act(() => result.current.rotate(['image', 'video', 'upload'], -90));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(photoService.rotatePhotos).toHaveBeenCalledWith('gallery', [
      { photo_id: 'image', rotation: 270, expected_revision: 0 },
    ]);
    expect(result.current.photos[1].rotation_status).toBe('ready');
  });

  it('undo restores each selected image orientation, including a pending edit', async () => {
    const photos = [
      original,
      {
        ...original,
        id: 'second',
        rotation: 90 as const,
        requested_rotation: 180 as const,
        rotation_revision: 4,
        rotation_status: 'processing' as const,
      },
    ];
    vi.mocked(photoService.rotatePhotos).mockResolvedValue({
      results: [],
      pending_rotation_count: 1,
    });
    const { result } = renderHook(() => usePhotoRotation(options(photos)));
    act(() => result.current.rotate(['image', 'second'], 90));
    const undo = vi.mocked(toast.success).mock.calls[0][1]?.action;
    act(() => {
      if (typeof undo === 'object' && 'onClick' in undo)
        undo.onClick({} as React.MouseEvent<HTMLButtonElement>);
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(photoService.rotatePhotos).toHaveBeenCalledWith('gallery', [
      { photo_id: 'image', rotation: 0, expected_revision: 0 },
      { photo_id: 'second', rotation: 180, expected_revision: 4 },
    ]);
  });

  it('queues clicks during an in-flight save against the returned revision', async () => {
    let complete!: (value: PhotoRotationResponse) => void;
    vi.mocked(photoService.rotatePhotos).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    vi.mocked(photoService.rotatePhotos).mockResolvedValueOnce(
      response({
        ...original,
        requested_rotation: 180,
        rotation_revision: 2,
        rotation_status: 'pending',
      }),
    );
    const opts = options();
    const { result } = renderHook(() => usePhotoRotation(opts));
    act(() => result.current.rotate(['image'], 90));
    await act(() => vi.advanceTimersByTimeAsync(300));
    act(() => result.current.rotate(['image'], 90));
    await act(async () =>
      complete(
        response({
          ...original,
          requested_rotation: 90,
          rotation_revision: 1,
          rotation_status: 'pending',
        }),
      ),
    );
    expect(result.current.photos[0].requested_rotation).toBe(180);
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(photoService.rotatePhotos).toHaveBeenNthCalledWith(2, 'gallery', [
      { photo_id: 'image', rotation: 180, expected_revision: 1 },
    ]);
  });

  it('refreshes covers when demo mode completes the edit immediately', async () => {
    const opts = options();
    vi.mocked(photoService.rotatePhotos).mockResolvedValue(
      response({
        ...original,
        rotation: 90,
        requested_rotation: 90,
        rotation_revision: 1,
        rotation_status: 'ready',
      }),
    );
    const { result } = renderHook(() => usePhotoRotation(opts));
    act(() => result.current.rotate(['image'], 90));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(opts.onSaved).toHaveBeenCalledOnce();
    expect(result.current.photos[0].rotation).toBe(90);
    expect(result.current.hasLocalEdits).toBe(false);
  });

  it('does not regress a published edit when stale props arrive', async () => {
    const opts = options();
    vi.mocked(photoService.rotatePhotos).mockResolvedValue(
      response({
        ...original,
        rotation: 90,
        requested_rotation: 90,
        rotation_revision: 1,
        rotation_status: 'ready',
      }),
    );
    const { result, rerender } = renderHook(({ photos }) => usePhotoRotation({ ...opts, photos }), {
      initialProps: { photos: [original] },
    });
    act(() => result.current.rotate(['image'], 90));
    await act(() => vi.advanceTimersByTimeAsync(300));
    rerender({ photos: [{ ...original }] });
    expect(result.current.photos[0].rotation_revision).toBe(1);
    expect(result.current.photos[0].rotation).toBe(90);
  });

  it('reconciles a lost response and retries without repeating a relative turn', async () => {
    vi.mocked(photoService.rotatePhotos).mockRejectedValueOnce(new Error('network'));
    vi.mocked(photoService.getRotationStatus).mockResolvedValue(
      response({
        ...original,
        requested_rotation: 90,
        rotation_revision: 1,
        rotation_status: 'pending',
      }),
    );
    vi.mocked(photoService.rotatePhotos).mockResolvedValueOnce(
      response({
        ...original,
        requested_rotation: 90,
        rotation_revision: 2,
        rotation_status: 'pending',
      }),
    );
    const opts = options();
    const { result } = renderHook(() => usePhotoRotation(opts));
    act(() => result.current.rotate(['image'], 90));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(photoService.getRotationStatus).toHaveBeenCalledWith('gallery', ['image']);
    const retry = vi.mocked(toast.error).mock.calls[0][1]?.action;
    await act(async () => {
      if (typeof retry === 'object' && 'onClick' in retry)
        retry.onClick({} as React.MouseEvent<HTMLButtonElement>);
    });
    expect(photoService.rotatePhotos).toHaveBeenNthCalledWith(2, 'gallery', [
      { photo_id: 'image', rotation: 90, expected_revision: 1 },
    ]);
  });
});
