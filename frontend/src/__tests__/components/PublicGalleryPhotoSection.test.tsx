import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PublicGalleryPhotoSection } from '../../components/public-gallery/PublicGalleryPhotoSection';
import type { PublicGridLayout } from '../../hooks/usePublicGalleryGrid';
import type { PublicPhoto } from '../../types';

vi.mock('../../components/LazyImage', () => ({
  LazyImage: ({ alt, className, objectFit }: { alt: string; className: string; objectFit: string }) => (
    <div
      data-testid="lazy-image"
      data-object-fit={objectFit}
      aria-label={alt}
      className={className}
    />
  ),
}));

const photo: PublicPhoto = {
  photo_id: 'public-photo',
  thumbnail_url: '/thumbnail.jpg',
  full_url: '/photo.jpg',
  filename: 'public-photo.jpg',
  width: 1_200,
  height: 800,
};

const renderSection = (gridLayout: PublicGridLayout, onLayoutChange = vi.fn()) =>
  render(
    <PublicGalleryPhotoSection
      photos={[photo]}
      totalPhotos={1}
      displayedPhotos={1}
      gridClassNames={`pg-grid pg-grid-layout-${gridLayout}`}
      gridLayout={gridLayout}
      gridDensity="large"
      gridRef={vi.fn()}
      getAspectRatioHint={() => 1.5}
      getItemStyle={() => ({})}
      observerTargetRef={{ current: null }}
      isLoadingMore={false}
      hasMore={false}
      onLayoutChange={onLayoutChange}
      onDensityChange={vi.fn()}
      onOpenPhoto={vi.fn()}
      touchHandlers={{
        onTouchStart: vi.fn(),
        onTouchMove: vi.fn(),
        onTouchEnd: vi.fn(),
        onTouchCancel: vi.fn(),
      }}
    />,
  );

describe('PublicGalleryPhotoSection', () => {
  it('keeps the complete image visible in uniform and crops only fill layouts', () => {
    const view = renderSection('uniform');
    expect(screen.getByTestId('lazy-image')).toHaveAttribute('data-object-fit', 'contain');
    expect(screen.getByTestId('lazy-image')).not.toHaveClass('group-hover:scale-[1.01]');

    view.rerender(
      <PublicGalleryPhotoSection
        photos={[photo]}
        totalPhotos={1}
        displayedPhotos={1}
        gridClassNames="pg-grid pg-grid-layout-justified"
        gridLayout="justified"
        gridDensity="large"
        gridRef={vi.fn()}
        getAspectRatioHint={() => 1.5}
        getItemStyle={() => ({ width: 300, height: 200 })}
        observerTargetRef={{ current: null }}
        isLoadingMore={false}
        hasMore={false}
        onLayoutChange={vi.fn()}
        onDensityChange={vi.fn()}
        onOpenPhoto={vi.fn()}
        touchHandlers={{
          onTouchStart: vi.fn(),
          onTouchMove: vi.fn(),
          onTouchEnd: vi.fn(),
          onTouchCancel: vi.fn(),
        }}
      />,
    );
    expect(screen.getByTestId('lazy-image')).toHaveAttribute('data-object-fit', 'cover');
    expect(screen.getByTestId('lazy-image')).toHaveClass('group-hover:scale-[1.01]');
    expect(screen.getByTestId('public-batch')).toHaveStyle({ width: '300px', height: '200px' });
  });

  it('exposes a public Justified control without owner dependencies', () => {
    const onLayoutChange = vi.fn();
    renderSection('masonry', onLayoutChange);

    fireEvent.click(screen.getAllByRole('button', { name: 'Justified' })[0]);
    expect(onLayoutChange).toHaveBeenCalledWith('justified');
  });
});
