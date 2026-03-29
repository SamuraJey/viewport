import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { PhotoCard } from '../../../components/gallery/PhotoCard';
import type { GalleryPhoto } from '../../../types';

const createPhoto = (overrides: Partial<GalleryPhoto> = {}): GalleryPhoto => ({
  id: 'photo-1',
  url: 'https://example.com/photo.jpg',
  thumbnail_url: 'https://example.com/photo-thumb.jpg',
  filename: 'photo.jpg',
  file_size: 1024,
  uploaded_at: '2026-01-01T00:00:00Z',
  width: 1200,
  height: 800,
  ...overrides,
});

describe('PhotoCard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows cached thumbnail when image is already complete', async () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1200);

    const { container } = render(
      <PhotoCard
        photo={createPhoto()}
        index={0}
        isSelectionMode={false}
        isSelected={false}
        isCover={false}
        onToggleSelection={vi.fn()}
        onOpenPhoto={vi.fn()}
        onSetCover={vi.fn()}
        onClearCover={vi.fn()}
        onRenamePhoto={vi.fn()}
        onDeletePhoto={vi.fn()}
      />,
    );

    const image = screen.getByRole('img', { name: 'Photo photo-1' });

    await waitFor(() => {
      expect(image).toHaveClass('opacity-100');
    });

    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });
});
