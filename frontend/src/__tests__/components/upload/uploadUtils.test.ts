import { describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_FILES,
  deduplicateUploadFiles,
  getUploadValidationError,
  prepareUploadSelection,
} from '../../../components/upload/uploadUtils';
import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES,
} from '../../../constants/upload';

const file = (name: string, size = 4, lastModified = 1) =>
  new File(['x'.repeat(size)], name, {
    type: 'image/jpeg',
    lastModified,
  });

describe('uploadUtils', () => {
  it('deduplicates the same file identity while preserving order', () => {
    const first = file('one.jpg');
    const duplicate = file('one.jpg');
    const distinct = file('one.jpg', 5);

    expect(deduplicateUploadFiles([first, duplicate, distinct])).toEqual([first, distinct]);
  });

  it('deduplicates against the existing queue and enforces the queue limit', () => {
    const existing = file('existing.jpg');
    const incoming = Array.from({ length: MAX_UPLOAD_FILES + 2 }, (_, index) =>
      file(`photo-${index}.jpg`),
    );

    const result = prepareUploadSelection([existing], [existing, ...incoming]);

    expect(result.files).toHaveLength(MAX_UPLOAD_FILES);
    expect(result.files[0]).toBe(existing);
    expect(result.duplicateCount).toBe(1);
    expect(result.overflowCount).toBe(3);
  });

  it('uses extension-aware image and video size messages when MIME is absent', () => {
    const image = new File(['image'], 'oversized.jpg', { type: '' });
    const video = new File(['video'], 'oversized.mov', { type: '' });
    Object.defineProperty(image, 'size', { value: MAX_UPLOAD_FILE_SIZE_BYTES + 1 });
    Object.defineProperty(video, 'size', { value: MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES + 1 });

    expect(getUploadValidationError(image)).toBe(
      'Image exceeds the 10 MB limit. Resize it before uploading.',
    );
    expect(getUploadValidationError(video)).toBe('Video exceeds the 500 MB limit.');
  });
});
