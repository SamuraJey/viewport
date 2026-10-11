import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
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
    vi.unstubAllGlobals();
  });

  it('shows cached thumbnail when image is already complete', async () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1200);

    render(
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

    expect(image).toHaveAttribute('data-loaded', 'true');
    expect(image).toHaveClass('data-[loaded=true]:opacity-100');
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

  it('reuses a grid slot without retaining a failed image or the previous actions', async () => {
    const actions = { ...callbacks(), isSelectionMode: false };
    const { rerender } = render(<PhotoCard photo={createPhoto()} {...actions} />);
    expect(document.querySelector('.owner-photo-placeholder')).toBeInTheDocument();
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
    expect(document.querySelector('.owner-photo-placeholder')).not.toBeInTheDocument();
    const next = createPhoto({ id: 'next', filename: 'next.jpg', thumbnail_url: '/next.jpg' });
    rerender(<PhotoCard photo={next} {...actions} />);
    const image = screen.getByRole('img', { name: 'next.jpg' });
    expect(image).not.toHaveAttribute('data-loaded');
    fireEvent.load(image);
    expect(image).toHaveAttribute('data-loaded', 'true');
    expect(screen.queryByText('Preview unavailable')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete photo' }));
    expect(actions.onDeletePhoto).toHaveBeenCalledExactlyOnceWith('next');
    rerender(<PhotoCard photo={createPhoto()} {...actions} />);
    expect(screen.getByRole('img', { name: 'photo.jpg' })).toBeInTheDocument();
  });

  it('defers offscreen actions and keeps focused actions available after scrolling away', async () => {
    let visibility!: (entries: IntersectionObserverEntry[]) => void;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: typeof visibility) {
          visibility = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const { container } = render(<PhotoCard photo={createPhoto()} {...callbacks()} />);
    const card = container.querySelector('[data-photo-card]')!;
    expect(screen.queryByRole('button', { name: 'Delete photo' })).not.toBeInTheDocument();
    act(() => visibility([{ target: card, isIntersecting: true } as IntersectionObserverEntry]));
    const download = screen.getByRole('button', { name: 'Download photo' });
    act(() => download.focus());
    act(() => visibility([{ target: card, isIntersecting: false } as IntersectionObserverEntry]));
    expect(download).toHaveFocus();
    expect(download).toBeInTheDocument();
    act(() => download.blur());
    expect(screen.queryByRole('button', { name: 'Download photo' })).not.toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'photo.jpg', exact: true }).focus());
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Set as cover' })).toHaveFocus();
  });

  it('turns a selected image without changing selection or opening it', async () => {
    const actions = callbacks();
    render(<PhotoCard photo={createPhoto()} {...actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Rotate photo clockwise 90°' }));
    expect(actions.onRotatePhoto).toHaveBeenCalledWith('photo-1', 90);
    expect(actions.onToggleSelection).not.toHaveBeenCalled();
    expect(actions.onOpenPhoto).not.toHaveBeenCalled();
  });

  it('renames from the filename and opens the photo from the image', async () => {
    const actions = { ...callbacks(), isSelectionMode: false };
    const user = userEvent.setup();
    render(<PhotoCard photo={createPhoto()} {...actions} />);

    await user.click(screen.getByRole('button', { name: 'Rename photo.jpg' }));
    expect(actions.onRenamePhoto).toHaveBeenCalledExactlyOnceWith('photo-1', 'photo.jpg');
    expect(actions.onOpenPhoto).not.toHaveBeenCalled();
    expect(actions.onToggleSelection).not.toHaveBeenCalled();

    await user.dblClick(screen.getByRole('button', { name: 'photo.jpg', exact: true }));
    expect(actions.onOpenPhoto).toHaveBeenCalledWith(0);
    expect(actions.onRenamePhoto).toHaveBeenCalledTimes(1);
  });

  it('deletes directly from the card button', async () => {
    const actions = callbacks();
    render(<PhotoCard photo={createPhoto()} {...actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete photo' }));
    expect(actions.onDeletePhoto).toHaveBeenCalledExactlyOnceWith('photo-1');
    expect(actions.onToggleSelection).not.toHaveBeenCalled();
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

  it('sets cover directly from the star button', async () => {
    const actions = callbacks();
    render(<PhotoCard photo={createPhoto()} {...actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Set as cover' }));
    expect(actions.onSetCover).toHaveBeenCalledWith('photo-1');
  });
});
