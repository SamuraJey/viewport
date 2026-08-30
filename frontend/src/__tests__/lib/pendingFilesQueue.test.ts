import { describe, expect, it } from 'vitest';
import {
  clearPendingFiles,
  consumePendingFiles,
  enqueuePendingFiles,
} from '../../lib/pendingFilesQueue';

const file = (name: string) => new File(['image'], name, { type: 'image/jpeg' });

describe('pendingFilesQueue', () => {
  it('returns an empty array when nothing is queued', () => {
    expect(consumePendingFiles('gallery-1')).toEqual([]);
  });

  it('enqueues and consumes files for a gallery', () => {
    const a = file('a.jpg');
    const b = file('b.jpg');
    enqueuePendingFiles('gallery-1', [a, b]);

    const consumed = consumePendingFiles('gallery-1');
    expect(consumed).toEqual([a, b]);
  });

  it('clears the queue after consumption (idempotent under StrictMode)', () => {
    const a = file('a.jpg');
    enqueuePendingFiles('gallery-1', [a]);

    expect(consumePendingFiles('gallery-1')).toHaveLength(1);
    // A second read (e.g. StrictMode double-invocation) must be a no-op.
    expect(consumePendingFiles('gallery-1')).toEqual([]);
  });

  it('keeps queues for different galleries separate', () => {
    const a = file('a.jpg');
    const b = file('b.jpg');
    enqueuePendingFiles('gallery-1', [a]);
    enqueuePendingFiles('gallery-2', [b]);

    expect(consumePendingFiles('gallery-1')).toEqual([a]);
    expect(consumePendingFiles('gallery-2')).toEqual([b]);
  });

  it('ignores empty file lists and missing gallery ids', () => {
    enqueuePendingFiles('gallery-1', []);
    enqueuePendingFiles('', [file('a.jpg')]);

    expect(consumePendingFiles('gallery-1')).toEqual([]);
    expect(consumePendingFiles('')).toEqual([]);
  });

  it('clears queued files without returning them', () => {
    const a = file('a.jpg');
    enqueuePendingFiles('gallery-1', [a]);

    clearPendingFiles('gallery-1');
    expect(consumePendingFiles('gallery-1')).toEqual([]);
  });
});
