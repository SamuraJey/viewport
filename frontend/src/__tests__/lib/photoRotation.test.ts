import { afterEach, describe, expect, it, vi } from 'vitest';
import { rotateThumbnail } from '../../lib/photoRotation';

describe('rotateThumbnail encoding', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    [undefined, undefined, 'image/png'],
    ['image/jpeg', 0.85, 'image/jpeg'],
  ])('encodes %s without changing rotation geometry', async (mimeType, quality, expectedType) => {
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 3100;
        naturalHeight = 1900;
        onload?: () => void;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    const context = { translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((cb, type) => {
        cb(new Blob(['encoded'], { type }));
      });
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:encoded');

    expect(await rotateThumbnail('source.jpg', 90, mimeType, quality)).toBe('blob:encoded');
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), expectedType, quality);
    expect(createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: expectedType }));
    const canvas = toBlob.mock.instances[0];
    expect([canvas.width, canvas.height]).toEqual([1900, 3100]);
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2);
  });
});
