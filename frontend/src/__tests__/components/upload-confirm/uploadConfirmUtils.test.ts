import { describe, it, expect } from 'vitest';
import {
  isResizableFile,
  isFileTooLarge,
} from '../../../components/upload-confirm/uploadConfirmUtils';
import { MAX_UPLOAD_FILE_SIZE_BYTES } from '../../../constants/upload';

function createMockFile(size: number, type: string): File {
  const blob = new Blob(['x'.repeat(Math.min(size, 1024))], { type });
  const file = new File([blob], 'test.jpg', { type });
  Object.defineProperty(file, 'size', { value: size, writable: false });
  return file;
}

describe('isResizableFile', () => {
  it('returns true for oversized JPEG files', () => {
    const file = createMockFile(MAX_UPLOAD_FILE_SIZE_BYTES + 1024, 'image/jpeg');
    expect(isResizableFile(file)).toBe(true);
  });

  it('returns true for oversized PNG files', () => {
    const file = createMockFile(MAX_UPLOAD_FILE_SIZE_BYTES + 1024, 'image/png');
    expect(isResizableFile(file)).toBe(true);
  });

  it('returns true for oversized image/jpg files', () => {
    const file = createMockFile(MAX_UPLOAD_FILE_SIZE_BYTES + 1024, 'image/jpg');
    expect(isResizableFile(file)).toBe(true);
  });

  it('returns false for oversized non-image files', () => {
    const file = createMockFile(MAX_UPLOAD_FILE_SIZE_BYTES + 1024, 'application/pdf');
    expect(isResizableFile(file)).toBe(false);
  });

  it('returns false for small image files (under limit)', () => {
    const file = createMockFile(1024, 'image/jpeg');
    expect(isResizableFile(file)).toBe(false);
  });

  it('returns false for small non-image files', () => {
    const file = createMockFile(1024, 'application/pdf');
    expect(isResizableFile(file)).toBe(false);
  });

  it('returns false for files exactly at the size limit', () => {
    const file = createMockFile(MAX_UPLOAD_FILE_SIZE_BYTES, 'image/jpeg');
    expect(isResizableFile(file)).toBe(false);
  });
});

describe('isFileTooLarge', () => {
  it('returns true when file exceeds MAX_UPLOAD_FILE_SIZE_BYTES', () => {
    const file = createMockFile(MAX_UPLOAD_FILE_SIZE_BYTES + 1, 'image/jpeg');
    expect(isFileTooLarge(file)).toBe(true);
  });

  it('returns false when file is under MAX_UPLOAD_FILE_SIZE_BYTES', () => {
    const file = createMockFile(MAX_UPLOAD_FILE_SIZE_BYTES - 1, 'image/jpeg');
    expect(isFileTooLarge(file)).toBe(false);
  });
});
