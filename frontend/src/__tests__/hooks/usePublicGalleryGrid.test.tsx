import { useCallback, useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicPhoto } from '../../types';

type UsePublicGalleryGridModule = typeof import('../../hooks/usePublicGalleryGrid');

const STORAGE_KEY = 'viewport:public-photo-ratios:v1';

type TestPhoto = PublicPhoto & { naturalWidth: number; naturalHeight: number };

const createPhoto = (photoId: string, naturalWidth: number, naturalHeight: number): TestPhoto => ({
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

interface ResizeObserverRecord {
  callback: ResizeObserverCallback;
  observed: Element[];
  disconnected: boolean;
}

let resizeObserverRecords: ResizeObserverRecord[] = [];

describe('usePublicGalleryGrid', () => {
  beforeEach(() => {
    vi.resetModules();
    window.sessionStorage.clear();
    resizeObserverRecords = [];

    vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 0)) as unknown as typeof requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', ((handle: number) =>
      clearTimeout(handle)) as unknown as typeof cancelAnimationFrame);
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserverMock {
        private readonly record: ResizeObserverRecord;

        constructor(callback: ResizeObserverCallback) {
          this.record = { callback, observed: [], disconnected: false };
          resizeObserverRecords.push(this.record);
        }

        observe(target: Element) {
          this.record.observed.push(target);
        }

        unobserve() {}

        disconnect() {
          this.record.disconnected = true;
        }
      },
    );
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 800,
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return Number(this.dataset.clientWidth ?? 0);
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
    photos: TestPhoto[],
    { initiallyMounted = true }: { initiallyMounted?: boolean } = {},
  ) => {
    const { usePublicGalleryGrid }: UsePublicGalleryGridModule =
      await import('../../hooks/usePublicGalleryGrid');

    const Harness = () => {
      const [mounted, setMounted] = useState(initiallyMounted);
      const renderCountRef = useRef(0);
      renderCountRef.current += 1;
      const grid = usePublicGalleryGrid({ photos });
      const { setGridRef } = grid;
      const connectGrid = useCallback(
        (node: HTMLDivElement | null) => {
          if (node) {
            node.dataset.clientWidth = '320';
            node.style.setProperty('--pg-columns', '2');
            node.style.gridAutoRows = '8px';
            node.style.gap = '8px';
          }
          setGridRef(node);
        },
        [setGridRef],
      );

      return (
        <>
          <button type="button" onClick={() => grid.setLayoutMode('masonry')}>
            Masonry
          </button>
          <button type="button" onClick={() => grid.setLayoutMode('uniform')}>
            Uniform
          </button>
          <button type="button" onClick={() => grid.setLayoutMode('justified')}>
            Justified
          </button>
          <button type="button" onClick={() => setMounted((value) => !value)}>
            Toggle grid
          </button>
          {mounted ? (
            <div
              ref={connectGrid}
              className={grid.gridClassNames}
              data-testid="grid"
              {...grid.touchHandlers}
            >
              {photos.map((photo) => (
                <div
                  key={photo.photo_id}
                  data-testid="card"
                  data-photo-id={photo.photo_id}
                  style={grid.getItemStyle(photo)}
                >
                  <span data-testid={`hint-${photo.photo_id}`}>
                    {grid.getAspectRatioHint(photo).toFixed(3)}
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
          ) : null}
          <output data-testid="layout-mode">{grid.gridLayout}</output>
          <output data-testid="render-count">{renderCountRef.current}</output>
        </>
      );
    };

    return render(<Harness />);
  };

  it('computes masonry spans from natural image sizes and preserves DOM order', async () => {
    const photos = [
      createPhoto('landscape', 320, 160),
      createPhoto('portrait', 160, 320),
      createPhoto('square', 200, 200),
    ];
    await renderHookHarness(photos);
    await flushAnimationFrames();

    const cards = screen.getAllByTestId('card');
    expect(cards.map((card) => card.dataset.photoId)).toEqual([
      'landscape',
      'portrait',
      'square',
    ]);
    cards.forEach((card) => fireEvent.load(card.querySelector('img') as HTMLImageElement));
    await flushAnimationFrames();

    await waitFor(() => {
      expect(cards[0]).toHaveStyle({ gridRowEnd: 'span 6' });
      expect(cards[1]).toHaveStyle({ gridRowEnd: 'span 20' });
      expect(cards[2]).toHaveStyle({ gridRowEnd: 'span 11' });
    });
  });

  it('keeps uniform cards free of crop-forcing geometry', async () => {
    await renderHookHarness([createPhoto('hero', 320, 160)]);
    await flushAnimationFrames();
    fireEvent.click(screen.getByRole('button', { name: 'Uniform' }));

    await waitFor(() => {
      expect(screen.getByTestId('layout-mode')).toHaveTextContent('uniform');
      expect(screen.getByTestId('grid')).toHaveClass('pg-grid-layout-uniform');
      expect(screen.getByTestId('card').style.gridRowEnd).toBe('');
      expect(screen.getByTestId('card').style.aspectRatio).toBe('');
    });
  });

  it('computes justified item geometry and fills a completed row', async () => {
    await renderHookHarness([
      createPhoto('landscape', 300, 200),
      createPhoto('portrait', 200, 300),
      createPhoto('square', 200, 200),
    ]);
    await flushAnimationFrames();
    fireEvent.click(screen.getByRole('button', { name: 'Justified' }));

    await waitFor(() => {
      const cards = screen.getAllByTestId('card');
      const widths = cards.map((card) => Number.parseFloat(card.style.width));
      const heights = cards.map((card) => Number.parseFloat(card.style.height));
      expect(widths.every((width) => width > 0)).toBe(true);
      expect(heights.every((height) => height > 0)).toBe(true);
      expect(heights[0]).toBeCloseTo(heights[1]);
    });
  });

  it('uses persisted aspect-ratio cache before an image load event fires', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ cached: 2 }));
    await renderHookHarness([createPhoto('cached', 100, 100)]);
    await flushAnimationFrames();

    await waitFor(() => {
      expect(screen.getByTestId('card')).toHaveStyle({ gridRowEnd: 'span 6' });
      expect(screen.getByTestId('hint-cached')).toHaveTextContent('2.000');
    });
  });

  it('does not invalidate React geometry when API dimensions are authoritative', async () => {
    await renderHookHarness([
      { ...createPhoto('api-sized', 100, 100), width: 320, height: 160 },
    ]);
    await flushAnimationFrames();
    const renderCountBeforeLoad = Number(screen.getByTestId('render-count').textContent);

    fireEvent.load(screen.getByRole('img', { name: 'api-sized.jpg' }));
    await flushAnimationFrames();

    expect(screen.getByTestId('hint-api-sized')).toHaveTextContent('2.000');
    expect(Number(screen.getByTestId('render-count').textContent)).toBe(renderCountBeforeLoad);
  });

  it('reattaches ResizeObserver when a conditional grid mounts again', async () => {
    await renderHookHarness([createPhoto('remount', 200, 100)], { initiallyMounted: false });
    expect(resizeObserverRecords).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle grid' }));
    await waitFor(() => expect(resizeObserverRecords).toHaveLength(1));
    expect(resizeObserverRecords[0].observed).toEqual([screen.getByTestId('grid')]);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle grid' }));
    await waitFor(() => expect(resizeObserverRecords[0].disconnected).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: 'Toggle grid' }));
    await waitFor(() => expect(resizeObserverRecords).toHaveLength(2));
    expect(resizeObserverRecords[1].observed).toEqual([screen.getByTestId('grid')]);
  });

  it('coalesces a 200-photo image-load burst into bounded React work', async () => {
    const photos = Array.from({ length: 200 }, (_, index) =>
      createPhoto(`photo-${index}`, index % 2 === 0 ? 300 : 200, index % 2 === 0 ? 200 : 300),
    );
    await renderHookHarness(photos);
    await flushAnimationFrames();
    const renderCountBeforeLoads = Number(screen.getByTestId('render-count').textContent);

    screen
      .getAllByRole('img')
      .forEach((image) => fireEvent.load(image as HTMLImageElement));
    await flushAnimationFrames();

    const renderCountAfterLoads = Number(screen.getByTestId('render-count').textContent);
    expect(renderCountAfterLoads - renderCountBeforeLoads).toBeLessThanOrEqual(2);
  });
});
