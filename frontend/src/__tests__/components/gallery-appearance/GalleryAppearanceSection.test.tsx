import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GalleryAppearanceSection } from '../../../components/gallery-appearance/GalleryAppearanceSection';
import type { GalleryDetail, PublicPhoto } from '../../../types';

const { mockUsePublicGalleryGrid } = vi.hoisted(() => ({
  mockUsePublicGalleryGrid: vi.fn(),
}));

vi.mock('../../../hooks/usePhotoLightbox', () => ({
  usePhotoLightbox: () => ({
    openLightbox: vi.fn(),
    renderLightbox: () => null,
  }),
}));

vi.mock('../../../hooks/usePublicGalleryGrid', () => ({
  usePublicGalleryGrid: mockUsePublicGalleryGrid,
}));

vi.mock('../../../components/public-gallery/PublicGalleryHero', () => ({
  PublicGalleryHero: () => <div data-testid="public-gallery-hero" />,
}));

vi.mock('../../../components/public-gallery/PublicGalleryPhotoSection', () => ({
  PublicGalleryPhotoSection: ({ photos }: { photos: PublicPhoto[] }) => (
    <div data-testid="public-gallery-photo-section">{photos.length}</div>
  ),
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

const gallery: GalleryDetail = {
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

describe('GalleryAppearanceSection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUsePublicGalleryGrid.mockReturnValue({
      gridDensity: 'large',
      gridLayout: 'masonry',
      gridRef: { current: null },
      gridClassNames: 'pg-grid',
      getAspectRatioHint: () => 1.5,
      setGridMode: vi.fn(),
      setLayoutMode: vi.fn(),
      touchHandlers: {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('passes stable preview photos to the public gallery grid when photos do not change', () => {
    render(
      <GalleryAppearanceSection
        gallery={gallery}
        photos={photos}
        isLoadingPhotos={false}
        onLoadCoverPhotos={vi.fn()}
        onSaveAppearance={vi.fn()}
      />,
    );

    const firstPreviewPhotos = mockUsePublicGalleryGrid.mock.calls[0][0].photos;

    fireEvent.click(screen.getByRole('button', { name: 'Large' }));

    const latestPreviewPhotos =
      mockUsePublicGalleryGrid.mock.calls[mockUsePublicGalleryGrid.mock.calls.length - 1][0].photos;
    expect(latestPreviewPhotos).toBe(firstPreviewPhotos);
  });

  it('serializes autosave requests instead of overlapping PATCH snapshots', async () => {
    const saves: Array<{ resolve: (value: GalleryDetail) => void }> = [];
    const onSaveAppearance = vi.fn(
      () =>
        new Promise<GalleryDetail>((resolve) => {
          saves.push({ resolve });
        }),
    );

    render(
      <GalleryAppearanceSection
        gallery={gallery}
        photos={photos}
        isLoadingPhotos={false}
        onLoadCoverPhotos={vi.fn()}
        onSaveAppearance={onSaveAppearance}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Large' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450);
    });
    expect(onSaveAppearance).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450);
    });
    expect(onSaveAppearance).toHaveBeenCalledTimes(1);

    await act(async () => {
      saves[0].resolve({ ...gallery, public_photo_spacing: 'large' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSaveAppearance).toHaveBeenCalledTimes(2);
    expect(onSaveAppearance).toHaveBeenLastCalledWith(
      expect.objectContaining({
        public_photo_spacing: 'large',
        public_color_scheme: 'dark',
      }),
    );

    await act(async () => {
      saves[1].resolve({
        ...gallery,
        public_photo_spacing: 'large',
        public_color_scheme: 'dark',
      });
      await Promise.resolve();
    });
  });

  it('retains a selected picker photo outside the preview photo subset', async () => {
    vi.useRealTimers();

    const pickerPhoto = {
      id: 'photo-3',
      url: '/photos/photo-3.jpg',
      thumbnail_url: '/photos/photo-3-thumb.jpg',
      filename: 'photo-3.jpg',
      file_size: 100,
      uploaded_at: '2026-01-01T00:02:00Z',
    };
    const onSaveAppearance = vi.fn().mockImplementation((payload) =>
      Promise.resolve({
        ...gallery,
        ...payload,
      }),
    );

    render(
      <GalleryAppearanceSection
        gallery={{ ...gallery, total_photos: 3 }}
        photos={photos}
        isLoadingPhotos={false}
        onLoadCoverPhotos={vi.fn().mockResolvedValue({ photos: [pickerPhoto], total: 1 })}
        onSaveAppearance={onSaveAppearance}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select cover image' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Select photo-3.jpg as cover' }));

    expect(screen.getByText('photo-3.jpg')).toBeInTheDocument();
    const focalPointButton = screen.getByRole('button', { name: 'Click to set focal point' });
    expect(focalPointButton.querySelector('img')).toHaveAttribute('src', pickerPhoto.thumbnail_url);
  });
});
