import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRotationPreviews } from '../../hooks/useRotationPreviews';
import { rotateThumbnail } from '../../lib/photoRotation';
import type { GalleryPhoto } from '../../types/photo';

vi.mock('../../lib/photoRotation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/photoRotation')>()),
  rotateThumbnail: vi.fn(),
}));
const photo: GalleryPhoto = {
  id: 'image',
  filename: 'image.jpg',
  media_type: 'image',
  status: 'successful',
  file_size: 100,
  uploaded_at: '',
  url: 'original-full',
  thumbnail_url: 'thumb',
  rotation: 0,
  requested_rotation: 90,
  rotation_status: 'pending',
};

describe('useRotationPreviews', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('uses thumbnails only, retains unchanged previews, and revokes on unmount', async () => {
    vi.mocked(rotateThumbnail).mockResolvedValue('blob:preview');
    const { result, rerender, unmount } = renderHook(({ photos }) => useRotationPreviews(photos), {
      initialProps: { photos: [photo] },
    });
    await act(async () => {});
    expect(rotateThumbnail).toHaveBeenCalledExactlyOnceWith('thumb', 90);
    expect(result.current(photo)).toBe('blob:preview');
    rerender({ photos: [{ ...photo }] });
    expect(result.current(photo)).toBe('blob:preview');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('does not reuse a revoked URL when direction cycles back', async () => {
    vi.mocked(rotateThumbnail)
      .mockResolvedValueOnce('blob:first')
      .mockResolvedValueOnce('blob:second')
      .mockResolvedValueOnce('blob:third');
    const { result, rerender } = renderHook(({ photos }) => useRotationPreviews(photos), {
      initialProps: { photos: [photo] },
    });
    await act(async () => {});
    expect(result.current(photo)).toBe('blob:first');
    const opposite = { ...photo, requested_rotation: 270 as const };
    rerender({ photos: [opposite] });
    await act(async () => {});
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
    expect(result.current(opposite)).toBe('blob:second');
    rerender({ photos: [photo] });
    expect(result.current(photo)).toBeUndefined();
    await act(async () => {});
    expect(result.current(photo)).toBe('blob:third');
  });

  it('limits simultaneous jobs and cleans previews finishing after unmount', async () => {
    const complete: ((url: string) => void)[] = [];
    vi.mocked(rotateThumbnail).mockImplementation(
      () => new Promise((resolve) => complete.push(resolve)),
    );
    const photos = Array.from({ length: 20 }, (_, id) => ({ ...photo, id: `image-${id}` }));
    const { unmount } = renderHook(() => useRotationPreviews(photos));
    expect(rotateThumbnail).toHaveBeenCalledTimes(4);
    unmount();
    await act(async () => complete.forEach((resolve, index) => resolve(`blob:${index}`)));
    expect(rotateThumbnail).toHaveBeenCalledTimes(4);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(4);
  });
});
