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

  it('loads only the thumbnail while a healthy preview is available', () => {
    const photo = createPhoto();
    render(<PhotoCard photo={photo} {...callbacks()} />);

    const image = screen.getByRole('img', { name: photo.filename });
    expect(image).toHaveAttribute('src', photo.thumbnail_url);
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
    fireEvent.load(image);
    expect(image).toHaveAttribute('data-loaded', 'true');
    expect(image).toHaveAttribute('src', photo.thumbnail_url);
  });

  it('loads the original after a thumbnail error and keeps photo opening intact', async () => {
    const photo = createPhoto();
    const actions = { ...callbacks(), isSelectionMode: false, index: 3 };
    render(<PhotoCard photo={photo} {...actions} />);
    const thumbnail = screen.getByRole('img', { name: photo.filename });
    fireEvent.load(thumbnail);
    fireEvent.error(thumbnail);

    const original = screen.getByRole('img', { name: photo.filename });
    expect(original).not.toBe(thumbnail);
    expect(original).toHaveAttribute('src', photo.url);
    expect(original).not.toHaveAttribute('data-loaded');
    expect(document.querySelector('.owner-photo-placeholder')).toBeInTheDocument();
    expect(screen.queryByText('Preview unavailable')).not.toBeInTheDocument();
    fireEvent.load(original);
    expect(original).toHaveAttribute('data-loaded', 'true');
    await userEvent.click(screen.getByRole('button', { name: photo.filename, exact: true }));
    expect(actions.onOpenPhoto).toHaveBeenCalledExactlyOnceWith(3);
    expect(actions.onToggleSelection).not.toHaveBeenCalled();
  });

  it('shows the retained original when processing failed without hiding the failure status', async () => {
    const photo = createPhoto({ status: 'failed' });
    const actions = callbacks();
    render(<PhotoCard photo={photo} {...actions} />);

    const original = screen.getByRole('img', { name: photo.filename });
    expect(original).toHaveAttribute('src', photo.url);
    expect(screen.getByLabelText('Photo processing failed')).toBeInTheDocument();
    fireEvent.load(original);
    expect(original).toHaveAttribute('data-loaded', 'true');
    await userEvent.click(screen.getByRole('button', { name: photo.filename, exact: true }));
    expect(actions.onToggleSelection).toHaveBeenCalledExactlyOnceWith(photo.id, false);
    expect(actions.onOpenPhoto).not.toHaveBeenCalled();
  });

  it('uses the original when an image has no thumbnail URL', () => {
    const photo = createPhoto({ thumbnail_url: '' });
    render(<PhotoCard photo={photo} {...callbacks()} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', photo.url);
  });

  it('stops after both image URLs fail instead of retrying on a card update', () => {
    const photo = createPhoto();
    const actions = callbacks();
    const { rerender } = render(<PhotoCard photo={photo} {...actions} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img')).toHaveAttribute('src', photo.url);
    fireEvent.error(screen.getByRole('img'));

    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(document.querySelector('.owner-photo-placeholder')).not.toBeInTheDocument();
    rerender(<PhotoCard photo={photo} {...actions} isSelected={false} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('does not retry the same URL when the thumbnail already is the original', () => {
    const photo = createPhoto({ thumbnail_url: 'https://example.com/photo.jpg' });
    render(<PhotoCard photo={photo} {...callbacks()} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('resets failed fallback state when the original URL changes', () => {
    const photo = createPhoto({ status: 'failed' });
    const actions = callbacks();
    const { rerender } = render(<PhotoCard photo={photo} {...actions} />);
    fireEvent.error(screen.getByRole('img', { name: photo.filename }));
    expect(screen.queryByRole('img', { name: photo.filename })).not.toBeInTheDocument();

    rerender(
      <PhotoCard photo={{ ...photo, url: 'https://example.com/photo.jpg?renewed' }} {...actions} />,
    );
    const original = screen.getByRole('img', { name: photo.filename });
    expect(original).toHaveAttribute('src', 'https://example.com/photo.jpg?renewed');
    expect(original).not.toHaveAttribute('data-loaded');
    fireEvent.load(original);
    expect(original).toHaveAttribute('data-loaded', 'true');
  });

  it('never tries to show a video original as an image after a poster error', () => {
    const photo = createPhoto({ media_type: 'video', url: 'https://example.com/video.mp4' });
    const actions = callbacks();
    const { rerender } = render(<PhotoCard photo={photo} {...actions} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', photo.thumbnail_url);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();

    rerender(<PhotoCard photo={{ ...photo, status: 'failed' }} {...actions} />);
    expect(screen.queryByRole('img', { name: photo.filename })).not.toBeInTheDocument();
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });

  it('does not double-rotate an optimistic preview but rotates its original fallback', () => {
    const photo = createPhoto({
      rotation: 0,
      rotation_status: 'pending',
      requested_rotation: 90,
      width: 1200,
      height: 800,
    });
    render(<PhotoCard photo={photo} previewUrl="blob:rotation-preview" {...callbacks()} />);
    const preview = screen.getByRole('img');
    expect(preview).toHaveAttribute('src', 'blob:rotation-preview');
    expect(preview.style.transform).toBe('');
    fireEvent.error(preview);
    const original = screen.getByRole('img');
    expect(original).toHaveAttribute('src', photo.url);
    expect(original).toHaveStyle({ transform: 'rotate(90deg) scale(1)' });
  });

  it('reuses a grid slot without retaining a failed image or the previous actions', async () => {
    const actions = { ...callbacks(), isSelectionMode: false };
    const { rerender } = render(<PhotoCard photo={createPhoto()} {...actions} />);
    expect(document.querySelector('.owner-photo-placeholder')).toBeInTheDocument();
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img')).toHaveAttribute('src', createPhoto().url);
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
