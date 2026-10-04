import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PhotoCard } from '../../../components/gallery/PhotoCard';
import type { GalleryPhoto } from '../../../types';

const createPhoto = (overrides: Partial<GalleryPhoto> = {}): GalleryPhoto => ({
  id: 'photo-1',
  media_type: 'image',
  url: 'https://example.com/photo.jpg',
  thumbnail_url: 'https://example.com/photo-thumb.jpg',
  filename: 'photo.jpg',
  file_size: 1024,
  uploaded_at: '2026-01-01T00:00:00Z',
  status: 'successful',
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
        onDownloadPhoto={vi.fn()}
        onDeletePhoto={vi.fn()}
      />,
    );

    const image = screen.getByRole('img', { name: 'photo.jpg' });

    await waitFor(() => {
      expect(image).toHaveClass('opacity-100');
    });

    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });

  const callbacks = () => ({
    index: 0,
    isSelectionMode: true,
    isSelected: true,
    isCover: false,
    onToggleSelection: vi.fn(),
    onOpenPhoto: vi.fn(),
    onSetCover: vi.fn(),
    onClearCover: vi.fn(),
    onRenamePhoto: vi.fn(),
    onDownloadPhoto: vi.fn(),
    onDeletePhoto: vi.fn(),
    onRotatePhoto: vi.fn(),
  });

  it('turns a selected image without changing selection or opening it', async () => {
    const actions = callbacks();
    render(<PhotoCard photo={createPhoto()} {...actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Rotate photo clockwise 90°' }));
    expect(actions.onRotatePhoto).toHaveBeenCalledWith('photo-1', 90);
    expect(actions.onToggleSelection).not.toHaveBeenCalled();
    expect(actions.onOpenPhoto).not.toHaveBeenCalled();
  });

  it('keeps turn controls active while saving and blocks downloading', () => {
    render(
      <PhotoCard
        photo={createPhoto({ rotation_status: 'pending', requested_rotation: 90 })}
        {...callbacks()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Rotate photo clockwise 90°' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Download photo' })).toBeDisabled();
    expect(screen.getByText('Saving rotation')).toBeInTheDocument();
  });

  it('does not allow rotating videos', () => {
    render(<PhotoCard photo={createPhoto({ media_type: 'video' })} {...callbacks()} />);
    expect(screen.getByRole('button', { name: 'Rotate photo clockwise 90°' })).toBeDisabled();
  });

  it('offers retry without changing the upload status', async () => {
    const actions = callbacks();
    render(
      <PhotoCard
        photo={createPhoto({ rotation_status: 'failed', requested_rotation: 90 })}
        {...actions}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Retry rotation' }));
    expect(actions.onRotatePhoto).toHaveBeenCalledWith('photo-1', 'retry');
  });

  it('retains cover and delete in the accessible overflow menu', async () => {
    const actions = callbacks();
    render(<PhotoCard photo={createPhoto()} {...actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'More photo actions' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Set as cover' }));
    expect(actions.onSetCover).toHaveBeenCalledWith('photo-1');
  });
});
