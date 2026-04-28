import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicPhoto } from '../../types';

type UsePublicGalleryGridModule = typeof import('../../hooks/usePublicGalleryGrid');

const STORAGE_KEY = 'viewport:public-photo-ratios:v1';

const createPhoto = (
  photoId: string,
  naturalWidth: number,
  naturalHeight: number,
): PublicPhoto & {
  naturalWidth: number;
  naturalHeight: number;
} => ({
  photo_id: photoId,
  thumbnail_url: `/thumbs/${photoId}.jpg`,
  full_url: `/full/${photoId}.jpg`,
  filename: `${photoId}.jpg`,
  naturalWidth,
  naturalHeight,
});

const flushAnimationFrames = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('usePublicGalleryGrid', () => {
  beforeEach(() => {
    vi.resetModules();
    window.sessionStorage.clear();
    vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 0)) as unknown as typeof requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', ((handle: number) =>
      clearTimeout(handle)) as unknown as typeof cancelAnimationFrame);
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 800,
    });

    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      const value = this.dataset.clientWidth;
      return value ? Number(value) : 0;
    });
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockImplementation(function (
      this: HTMLImageElement,
    ) {
      return Number(this.dataset.naturalWidth ?? 0);
    });
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockImplementation(function (
      this: HTMLImageElement,
    ) {
      return Number(this.dataset.naturalHeight ?? 0);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const renderHookHarness = async (
    photos: Array<
      PublicPhoto & {
        naturalWidth: number;
        naturalHeight: number;
      }
    >,
  ) => {
    const { usePublicGalleryGrid }: UsePublicGalleryGridModule =
      await import('../../hooks/usePublicGalleryGrid');

    const Harness = () => {
      const { gridRef, gridClassNames, gridLayout, getAspectRatioHint, setLayoutMode } =
        usePublicGalleryGrid({ photos });

      return (
        <>
          <button type="button" onClick={() => setLayoutMode('uniform')}>
            Uniform
          </button>
          <div
            ref={(node) => {
              gridRef.current = node;
              if (node) {
                node.dataset.clientWidth = '320';
                node.style.setProperty('--pg-columns', '2');
                node.style.gridAutoRows = '8px';
                node.style.rowGap = '8px';
                node.style.gap = '8px';
              }
            }}
            className={gridClassNames}
            data-testid="grid"
          >
            {photos.map((photo) => (
              <div key={photo.photo_id} data-testid="card" data-photo-id={photo.photo_id}>
                <span data-testid={`hint-${photo.photo_id}`}>
                  {getAspectRatioHint(photo).toFixed(3)}
                </span>
                <img
                  alt={photo.filename ?? photo.photo_id}
                  data-natural-width={photo.naturalWidth}
                  data-natural-height={photo.naturalHeight}
                  src={photo.thumbnail_url}
                />
              </div>
            ))}
          </div>
          <div data-testid="layout-mode">{gridLayout}</div>
        </>
      );
    };

    render(<Harness />);
  };

  it('computes masonry spans from natural image sizes and preserves DOM order without backend dimensions', async () => {
    const photos = [
      createPhoto('landscape', 320, 160),
      createPhoto('portrait', 160, 320),
      createPhoto('square', 200, 200),
    ];

    await renderHookHarness(photos);
    await flushAnimationFrames();

    const cards = screen.getAllByTestId('card');
    expect(cards.map((card) => card.getAttribute('data-photo-id'))).toEqual([
      'landscape',
      'portrait',
      'square',
    ]);

    cards.forEach((card) => {
      const image = card.querySelector('img');
      expect(image).not.toBeNull();
      fireEvent.load(image as HTMLImageElement);
    });

    await flushAnimationFrames();

    await waitFor(() => {
      expect(cards[0]).toHaveStyle({ gridRowEnd: 'span 6' });
      expect(cards[1]).toHaveStyle({ gridRowEnd: 'span 20' });
      expect(cards[2]).toHaveStyle({ gridRowEnd: 'span 11' });
    });
  });

  it('clears spans when switching from masonry to uniform layout', async () => {
    const photos = [createPhoto('hero', 320, 160)];

    await renderHookHarness(photos);
    await flushAnimationFrames();

    const card = screen.getByTestId('card');
    const image = card.querySelector('img');
    expect(image).not.toBeNull();

    fireEvent.load(image as HTMLImageElement);
    await flushAnimationFrames();

    await waitFor(() => {
      expect(card).toHaveStyle({ gridRowEnd: 'span 6' });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Uniform' }));

    await waitFor(() => {
      expect(screen.getByTestId('layout-mode')).toHaveTextContent('uniform');
      expect(card.style.gridRowEnd).toBe('');
    });
  });

  it('uses persisted aspect-ratio cache before any image load event fires', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ cached: 2 }));

    await renderHookHarness([createPhoto('cached', 100, 100)]);
    await flushAnimationFrames();

    await waitFor(() => {
      expect(screen.getByTestId('card')).toHaveStyle({ gridRowEnd: 'span 6' });
      expect(screen.getByTestId('hint-cached')).toHaveTextContent('2.000');
    });
  });

  it('uses API dimensions to stabilize masonry before lazy images load', async () => {
    await renderHookHarness([
      {
        ...createPhoto('api-sized', 100, 100),
        width: 320,
        height: 160,
      },
    ]);
    await flushAnimationFrames();

    await waitFor(() => {
      expect(screen.getByTestId('card')).toHaveStyle({ gridRowEnd: 'span 6' });
      expect(screen.getByTestId('hint-api-sized')).toHaveTextContent('2.000');
    });
  });
});
