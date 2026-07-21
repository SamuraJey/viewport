import { describe, expect, it } from 'vitest';

import {
  computeJustifiedLayout,
  computeJustifiedRows,
  computeMasonrySpans,
  getPublicPhotoAspectRatio,
  hasIntrinsicPublicPhotoAspectRatio,
} from '../../lib/publicPhotoGridLayout';

const justifiedOptions = {
  targetRowHeight: 100,
  gap: 10,
  containerWidth: 320,
};

describe('publicPhotoGridLayout', () => {
  it('normalizes API dimensions, explicit ratios, and invalid fallbacks', () => {
    expect(getPublicPhotoAspectRatio({ photo_id: 'explicit', ratio: 1.5 })).toBe(1.5);
    expect(getPublicPhotoAspectRatio({ photo_id: 'dimensions', width: 400, height: 200 })).toBe(2);
    expect(getPublicPhotoAspectRatio({ photo_id: 'invalid', ratio: Number.NaN })).toBeCloseTo(4 / 3);
    expect(hasIntrinsicPublicPhotoAspectRatio({ photo_id: 'sized', width: 400, height: 200 })).toBe(
      true,
    );
    expect(hasIntrinsicPublicPhotoAspectRatio({ photo_id: 'unsized' })).toBe(false);
  });

  describe('computeJustifiedRows', () => {
    it('returns no rows for an empty collection', () => {
      expect(computeJustifiedRows([], justifiedOptions)).toEqual([]);
    });

    it('groups equal-ratio photos without changing their order or identity', () => {
      const photos = Array.from({ length: 7 }, (_, index) => ({
        photo_id: `${index}`,
        ratio: 1,
      }));
      const rows = computeJustifiedRows(photos, justifiedOptions);

      expect(rows.map((row) => row.map((photo) => photo.photo_id))).toEqual([
        ['0', '1', '2'],
        ['3', '4', '5'],
        ['6'],
      ]);
      expect(rows[0][0]).toBe(photos[0]);
    });

    it('uses mixed ratios while preserving public photo order', () => {
      const photos = [
        { photo_id: 'wide', ratio: 2 },
        { photo_id: 'portrait', ratio: 0.5 },
        { photo_id: 'square', ratio: 1 },
        { photo_id: 'landscape', width: 300, height: 200 },
      ];

      expect(
        computeJustifiedRows(photos, { ...justifiedOptions, containerWidth: 260 }).map((row) =>
          row.map((photo) => photo.photo_id),
        ),
      ).toEqual([
        ['wide', 'portrait', 'square'],
        ['landscape'],
      ]);
    });

    it('keeps an incomplete final row instead of stretching or discarding it', () => {
      const photos = Array.from({ length: 5 }, (_, index) => ({
        photo_id: `${index}`,
        ratio: 1,
      }));
      const layout = computeJustifiedLayout(photos, justifiedOptions);

      expect(layout.rows).toHaveLength(2);
      expect(layout.rows[0].width).toBeCloseTo(319.5);
      expect(layout.rows[0].isComplete).toBe(true);
      expect(layout.rows[1].height).toBeCloseTo(100);
      expect(layout.rows[1].width).toBeCloseTo(210);
      expect(layout.rows[1].isComplete).toBe(false);
    });

    it('crop-bounds extreme source ratios without producing invalid geometry', () => {
      const layout = computeJustifiedLayout(
        [
          { photo_id: 'nan', ratio: Number.NaN },
          { photo_id: 'ultrawide', ratio: 10_000 },
          { photo_id: 'ultratall', ratio: 0.000_01 },
        ],
        { ...justifiedOptions, containerWidth: 1_000, maxCropRatio: 1.5 },
      );

      expect(layout.itemGeometry.map((item) => item.aspectRatio)).toEqual([
        4 / 3,
        1.5,
        1 / 1.5,
      ]);
      layout.itemGeometry.forEach(({ width, height }) => {
        expect(Number.isFinite(width)).toBe(true);
        expect(Number.isFinite(height)).toBe(true);
        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);
      });
    });

    it('uses the 1.5 crop bound when maxCropRatio is omitted or invalid', () => {
      const photos = [
        { photo_id: 'ultrawide', ratio: 10_000 },
        { photo_id: 'ultratall', ratio: 0.000_01 },
      ];

      expect(
        computeJustifiedLayout(photos, {
          ...justifiedOptions,
          containerWidth: 1_000,
        }).itemGeometry.map((item) => item.aspectRatio),
      ).toEqual([1.5, 1 / 1.5]);
      expect(
        computeJustifiedLayout(photos, {
          ...justifiedOptions,
          containerWidth: 1_000,
          maxCropRatio: 0.5,
        }).itemGeometry.map((item) => item.aspectRatio),
      ).toEqual([1.5, 1 / 1.5]);
    });

    it('does not overflow a narrow container with a wide last-row photo', () => {
      const layout = computeJustifiedLayout([{ photo_id: 'panorama', ratio: 4 }], {
        ...justifiedOptions,
        containerWidth: 200,
      });

      expect(layout.rows[0].width).toBeLessThanOrEqual(200);
      expect(layout.rows[0].width).toBeCloseTo(150);
      expect(layout.rows[0].height).toBeCloseTo(100);
    });

    it('never upscales a completed row beyond the target height', () => {
      const layout = computeJustifiedLayout(
        [
          { photo_id: 'portrait', ratio: 0.5 },
          { photo_id: 'wide', ratio: 3 },
          { photo_id: 'tail', ratio: 1 },
        ],
        justifiedOptions,
      );

      expect(layout.rows[0].isComplete).toBe(true);
      expect(layout.rows[0].height).toBeLessThanOrEqual(justifiedOptions.targetRowHeight);
      expect(layout.rows[0].width).toBeCloseTo(justifiedOptions.containerWidth - 0.5);
    });

    it('keeps portrait-heavy completed rows inside the flex line rounding budget', () => {
      const layout = computeJustifiedLayout(
        Array.from({ length: 100 }, (_, index) => ({
          photo_id: `portrait-${index}`,
          ratio: index % 5 === 0 ? 1.5 : 2 / 3,
        })),
        {
          targetRowHeight: 360,
          gap: 16,
          containerWidth: 1_968,
          maxCropRatio: 1.5,
        },
      );

      layout.rows
        .filter((row) => row.isComplete)
        .forEach((row) => {
          expect(row.width).toBeLessThanOrEqual(1_968);
          expect(1_968 - row.width).toBeLessThanOrEqual(0.5);
        });
    });
  });

  it('matches the existing public masonry span calculation', () => {
    expect(
      computeMasonrySpans(
        [
          { photo_id: 'landscape', ratio: 2 },
          { photo_id: 'portrait', ratio: 0.5 },
          { photo_id: 'square', ratio: 1 },
        ],
        { columnWidth: 156, gap: 8, rowHeight: 8 },
      ),
    ).toEqual([6, 20, 11]);
  });

  it('computes public masonry and justified geometry for 200 photos within 100ms', () => {
    const photos = Array.from({ length: 200 }, (_, index) => ({
      photo_id: `photo-${index}`,
      ratio: index % 3 === 0 ? 2 / 3 : index % 3 === 1 ? 3 / 2 : 1,
    }));
    const startedAt = performance.now();

    computeMasonrySpans(photos, { columnWidth: 240, gap: 16, rowHeight: 8 });
    computeJustifiedLayout(photos, {
      targetRowHeight: 280,
      gap: 16,
      containerWidth: 1_200,
      maxCropRatio: 1.5,
    });

    expect(performance.now() - startedAt).toBeLessThan(100);
  });
});
