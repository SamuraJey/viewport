import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { photoService } from '../../services/photoService';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

type XhrBehavior =
  | { type: 'load'; status?: number; statusText?: string; progress?: number }
  | { type: 'error' };

class MockXMLHttpRequest {
  static sendQueue: XhrBehavior[] = [];
  static instances: MockXMLHttpRequest[] = [];

  status = 200;
  statusText = 'OK';
  method = '';
  url = '';
  headers: Array<[string, string]> = [];
  uploadProgress?: (event: ProgressEvent) => void;
  listeners: Record<string, Array<() => void>> = {};
  sentFile?: File;

  upload = {
    addEventListener: (event: string, cb: (event: ProgressEvent) => void) => {
      if (event === 'progress') {
        this.uploadProgress = cb;
      }
    },
  };

  constructor() {
    MockXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers.push([name, value]);
  }

  addEventListener(type: string, cb: () => void) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(cb);
  }

  removeEventListener(type: string, cb: () => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((fn) => fn !== cb);
  }

  send(file: File) {
    this.sentFile = file;
    const behavior = MockXMLHttpRequest.sendQueue.shift() ?? { type: 'load', status: 200 };

    if (this.uploadProgress && behavior.type === 'load' && behavior.progress !== undefined) {
      this.uploadProgress({
        lengthComputable: true,
        loaded: behavior.progress,
        total: file.size,
      } as ProgressEvent);
    }

    if (behavior.type === 'load') {
      this.status = behavior.status ?? 200;
      this.statusText = behavior.statusText ?? 'OK';
      (this.listeners.load ?? []).forEach((cb) => cb());
      return;
    }

    (this.listeners.error ?? []).forEach((cb) => cb());
  }

  abort() {
    (this.listeners.abort ?? []).forEach((cb) => cb());
  }
}

const createFile = (name: string, size: number, type = 'image/jpeg') => {
  const data = new Uint8Array(size);
  return new File([data], name, { type });
};

describe('photoService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest);
    MockXMLHttpRequest.sendQueue = [];
    MockXMLHttpRequest.instances = [];
    vi.spyOn(console, 'warn').mockImplementation(() => { });
    vi.spyOn(console, 'error').mockImplementation(() => { });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes photo by gallery and photo id', async () => {
    vi.mocked(api.delete).mockResolvedValue({} as any);

    await photoService.deletePhoto('gallery-1', 'photo-1');

    expect(api.delete).toHaveBeenCalledWith('/galleries/gallery-1/photos/photo-1');
  });

  it('renames photo with provided filename', async () => {
    const response = {
      data: {
        id: 'photo-1',
        gallery_id: 'gallery-1',
        url: '/photo',
        thumbnail_url: '/thumb',
        filename: 'new.jpg',
        file_size: 123,
        uploaded_at: '2025-01-01T00:00:00Z',
      },
    };

    vi.mocked(api.patch).mockResolvedValue(response as any);

    const result = await photoService.renamePhoto('gallery-1', 'photo-1', 'new.jpg');

    expect(api.patch).toHaveBeenCalledWith('/galleries/gallery-1/photos/photo-1/rename', {
      filename: 'new.jpg',
    });
    expect(result).toEqual(response.data);
  });

  it('returns empty response when no files provided', async () => {
    const result = await photoService.uploadPhotosPresigned('gallery-1', []);

    expect(result).toEqual({
      results: [],
      total_files: 0,
      successful_uploads: 0,
      failed_uploads: 0,
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('flags oversized files without calling presign', async () => {
    const oversized = createFile('big.jpg', 11 * 1024 * 1024);

    const result = await photoService.uploadPhotosPresigned('gallery-1', [oversized]);

    expect(result.failed_uploads).toBe(1);
    expect(result.successful_uploads).toBe(0);
    expect(result.results[0]).toEqual({
      filename: 'big.jpg',
      success: false,
      error: 'File exceeds maximum size of 10MB',
      retryable: false,
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('handles presigned batch failures', async () => {
    const file = createFile('photo.jpg', 1024);

    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        items: [{ filename: 'photo.jpg', success: false, error: 'File rejected' }],
      },
    } as any);

    const result = await photoService.uploadPhotosPresigned('gallery-1', [file]);

    expect(api.post).toHaveBeenCalledWith(
      '/galleries/gallery-1/photos/batch-presigned',
      {
        files: [
          {
            filename: 'photo.jpg',
            file_size: 1024,
            content_type: 'image/jpeg',
          },
        ],
      },
      { signal: undefined },
    );
    expect(result.failed_uploads).toBe(1);
    expect(result.results[0]).toEqual({
      filename: 'photo.jpg',
      success: false,
      error: 'File rejected',
    });
  });

  it('uploads files, tracks progress, and confirms batch', async () => {
    const fileA = createFile('a.jpg', 2000);
    const fileB = createFile('b.jpg', 3000);

    vi.mocked(api.post).mockImplementation((url) => {
      if (url === '/galleries/gallery-1/photos/batch-presigned') {
        return Promise.resolve({
          data: {
            items: [
              {
                filename: 'a.jpg',
                success: true,
                photo_id: 'photo-a',
                presigned_data: {
                  url: 'https://s3/upload-a',
                  headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '2000' },
                },
              },
              {
                filename: 'b.jpg',
                success: true,
                photo_id: 'photo-b',
                presigned_data: {
                  url: 'https://s3/upload-b',
                  headers: { 'Content-Type': 'image/jpeg' },
                },
              },
            ],
          },
        } as any);
      }

      if (url === '/galleries/gallery-1/photos/batch-confirm') {
        return Promise.resolve({ data: {} } as any);
      }

      return Promise.reject(new Error('Unexpected url'));
    });

    MockXMLHttpRequest.sendQueue = [
      { type: 'load', status: 200, progress: fileA.size },
      { type: 'load', status: 200, progress: fileB.size },
    ];

    const progressSpy = vi.fn();

    const result = await photoService.uploadPhotosPresigned('gallery-1', [fileA, fileB], progressSpy);

    expect(result.successful_uploads).toBe(2);
    expect(result.failed_uploads).toBe(0);
    expect(result.total_files).toBe(2);

    const lastProgress = progressSpy.mock.calls.at(-1)?.[0];
    expect(lastProgress).toMatchObject({
      percentage: 100,
      successCount: 2,
      failedCount: 0,
    });

    expect(api.post).toHaveBeenCalledWith(
      '/galleries/gallery-1/photos/batch-confirm',
      {
        items: [
          { photo_id: 'photo-a', success: true },
          { photo_id: 'photo-b', success: true },
        ],
      },
      { signal: undefined },
    );

    const firstHeaders = MockXMLHttpRequest.instances[0]?.headers ?? [];
    expect(firstHeaders.find(([key]) => key.toLowerCase() === 'content-length')).toBeUndefined();
  });

  it('marks empty files as failed and confirms failed ids', async () => {
    const emptyFile = createFile('empty.jpg', 0);

    vi.mocked(api.post).mockImplementation((url) => {
      if (url === '/galleries/gallery-1/photos/batch-presigned') {
        return Promise.resolve({
          data: {
            items: [
              {
                filename: 'empty.jpg',
                success: true,
                photo_id: 'photo-empty',
                presigned_data: {
                  url: 'https://s3/upload-empty',
                  headers: { 'Content-Type': 'image/jpeg' },
                },
              },
            ],
          },
        } as any);
      }

      if (url === '/galleries/gallery-1/photos/batch-confirm') {
        return Promise.resolve({ data: {} } as any);
      }

      return Promise.reject(new Error('Unexpected url'));
    });

    const result = await photoService.uploadPhotosPresigned('gallery-1', [emptyFile]);

    expect(result.failed_uploads).toBe(1);
    expect(result.successful_uploads).toBe(0);
    expect(result.results[0]).toEqual({
      filename: 'empty.jpg',
      success: false,
      error: 'Cannot upload empty file',
    });

    expect(api.post).toHaveBeenCalledWith(
      '/galleries/gallery-1/photos/batch-confirm',
      {
        items: [{ photo_id: 'photo-empty', success: false }],
      },
      { signal: undefined },
    );
  });

  it('retries transient network errors before succeeding', async () => {
    vi.useFakeTimers();

    const file = createFile('retry.jpg', 1024);

    vi.mocked(api.post).mockImplementation((url) => {
      if (url === '/galleries/gallery-1/photos/batch-presigned') {
        return Promise.resolve({
          data: {
            items: [
              {
                filename: 'retry.jpg',
                success: true,
                photo_id: 'photo-retry',
                presigned_data: {
                  url: 'https://s3/upload-retry',
                  headers: { 'Content-Type': 'image/jpeg' },
                },
              },
            ],
          },
        } as any);
      }

      if (url === '/galleries/gallery-1/photos/batch-confirm') {
        return Promise.resolve({ data: {} } as any);
      }

      return Promise.reject(new Error('Unexpected url'));
    });

    MockXMLHttpRequest.sendQueue = [{ type: 'error' }, { type: 'load', status: 200 }];

    const promise = photoService.uploadPhotosPresigned('gallery-1', [file]);

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.successful_uploads).toBe(1);
    expect(MockXMLHttpRequest.instances.length).toBe(2);

    vi.useRealTimers();
  });

  it('returns empty results when retryFailedUploads gets no files', async () => {
    const result = await photoService.retryFailedUploads('gallery-1', []);

    expect(result).toEqual({
      results: [],
      total_files: 0,
      successful_uploads: 0,
      failed_uploads: 0,
    });
  });
});
