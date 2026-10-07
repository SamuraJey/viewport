import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../components/lightbox/PhotoLightbox', () => ({
  default: ({ open, index }: { open?: boolean; index?: number }) =>
    open ? <div data-testid="viewer">Photo {index}</div> : null,
}));
vi.mock('yet-another-react-lightbox/styles.css?url', () => ({ default: '/viewer-main.css' }));
vi.mock('yet-another-react-lightbox/plugins/thumbnails.css?url', () => ({
  default: '/viewer-thumbnails.css',
}));

const stylesheet = (name: string) =>
  document.querySelector<HTMLLinkElement>(`link[href$="${name}"]`)!;
const settle = async (event: 'load' | 'error', name: string) => {
  await act(async () => {
    stylesheet(name).dispatchEvent(new Event(event));
  });
};

beforeEach(() => {
  vi.resetModules();
  document.querySelectorAll('link[href*="viewer-"]').forEach((link) => link.remove());
});

describe('deferred viewer stylesheet recovery', () => {
  it('does not request CSS while closed and retries a failed sheet locally without reloading the page', async () => {
    const { DeferredPhotoLightbox } =
      await import('../../../components/lightbox/DeferredPhotoLightbox');
    const { rerender } = render(
      <>
        <main>Gallery stays mounted</main>
        <DeferredPhotoLightbox open={false} index={2} />
      </>,
    );
    expect(stylesheet('viewer-main.css')).toBeNull();
    rerender(
      <>
        <main>Gallery stays mounted</main>
        <DeferredPhotoLightbox open index={2} />
      </>,
    );
    await settle('load', 'viewer-thumbnails.css');
    await settle('error', 'viewer-main.css');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load photo viewer styles',
    );
    expect(screen.getByText('Gallery stays mounted')).toBeInTheDocument();
    expect(screen.queryByTestId('viewer')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry photo viewer' }));
    await waitFor(() => expect(stylesheet('viewer-main.css')).not.toBeNull());
    expect(document.querySelectorAll('link[href$="viewer-thumbnails.css"]')).toHaveLength(1);
    await settle('load', 'viewer-main.css');
    expect(await screen.findByTestId('viewer')).toHaveTextContent('Photo 2');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores errors after closing and can recover on a later open', async () => {
    const { DeferredPhotoLightbox } =
      await import('../../../components/lightbox/DeferredPhotoLightbox');
    const close = vi.fn();
    const { rerender } = render(<DeferredPhotoLightbox open close={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel loading photo viewer' }));
    expect(close).toHaveBeenCalledOnce();
    rerender(<DeferredPhotoLightbox open={false} close={close} />);
    await settle('error', 'viewer-main.css');
    await settle('load', 'viewer-thumbnails.css');
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<DeferredPhotoLightbox open close={close} />);
    await waitFor(() => expect(stylesheet('viewer-main.css')).not.toBeNull());
    await settle('load', 'viewer-main.css');
    expect(await screen.findByTestId('viewer')).toBeInTheDocument();
  });

  it('offers Close after a failure without affecting the gallery', async () => {
    const { DeferredPhotoLightbox } =
      await import('../../../components/lightbox/DeferredPhotoLightbox');
    const close = vi.fn();
    render(<DeferredPhotoLightbox open close={close} />);
    await settle('error', 'viewer-thumbnails.css');
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Close photo viewer' }));
    expect(close).toHaveBeenCalledOnce();
  });
});
