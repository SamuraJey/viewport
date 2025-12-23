import { describe, it, expect, vi, beforeEach } from 'vitest';
import { photoService } from '../../services/photoService';
import { api } from '../../lib/api';

// Mock the api module
vi.mock('../../lib/api', () => ({
  api: {
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    get: vi.fn(),
  },
}));

describe('photoService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadPhoto', () => {
    it('should upload photo with FormData', async () => {
      const galleryId = 'gallery-123';
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      const mockResponse = {
        data: {
          id: 'photo-123',
          gallery_id: galleryId,
          url: '/photos/photo-123',
          created_at: '2025-01-01T00:00:00Z',
        },
      };

      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await photoService.uploadPhoto(galleryId, mockFile);

      expect(api.post).toHaveBeenCalledWith(
        `/galleries/${galleryId}/photos`,
        expect.any(FormData),
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle upload errors', async () => {
      const galleryId = 'gallery-123';
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      const mockError = new Error('Upload failed');
      vi.mocked(api.post).mockRejectedValue(mockError);

      await expect(photoService.uploadPhoto(galleryId, mockFile)).rejects.toThrow('Upload failed');
    });
  });

  describe('deletePhoto', () => {
    it('should make DELETE request to remove photo', async () => {
      const galleryId = 'gallery-123';
      const photoId = 'photo-123';

      vi.mocked(api.delete).mockResolvedValue({} as any);

      await photoService.deletePhoto(galleryId, photoId);

      expect(api.delete).toHaveBeenCalledWith(`/galleries/${galleryId}/photos/${photoId}`);
    });

    it('should handle delete errors', async () => {
      const galleryId = 'gallery-123';
      const photoId = 'non-existent';

      const mockError = new Error('Photo not found');
      vi.mocked(api.delete).mockRejectedValue(mockError);

      await expect(photoService.deletePhoto(galleryId, photoId)).rejects.toThrow('Photo not found');
      expect(api.delete).toHaveBeenCalledWith(`/galleries/${galleryId}/photos/${photoId}`);
    });
  });

  describe('service methods', () => {
    it('should have all required methods', () => {
      expect(typeof photoService.uploadPhoto).toBe('function');
      expect(typeof photoService.deletePhoto).toBe('function');
    });
  });

  describe('metadata endpoints', () => {
    it('renames a photo', async () => {
      const galleryId = 'g1';
      const photoId = 'p1';
      const filename = 'new.jpg';

      vi.mocked(api.patch).mockResolvedValue({ data: { id: photoId, filename } } as any);

      const response = await photoService.renamePhoto(galleryId, photoId, filename);

      expect(api.patch).toHaveBeenCalledWith(
        `/galleries/${galleryId}/photos/${photoId}/rename`,
        { filename },
      );
      expect(response).toEqual({ id: photoId, filename });
    });

    it('fetches photo URLs', async () => {
      const galleryId = 'g1';
      const photoId = 'p1';
      const urlResponse = { data: { url: '/full/p1.jpg' } } as any;
      const directResponse = { data: { url: '/auth/p1.jpg' } } as any;
      const allResponse = { data: [{ id: 'p1' }, { id: 'p2' }] } as any;

      vi.mocked(api.get)
        .mockResolvedValueOnce(urlResponse)
        .mockResolvedValueOnce(directResponse)
        .mockResolvedValueOnce(allResponse);

      const url = await photoService.getPhotoUrl(galleryId, photoId);
      const direct = await photoService.getPhotoUrlDirect(photoId);
      const all = await photoService.getAllPhotoUrls(galleryId);

      expect(api.get).toHaveBeenNthCalledWith(
        1,
        `/galleries/${galleryId}/photos/${photoId}/url`,
      );
      expect(api.get).toHaveBeenNthCalledWith(2, `/photos/auth/${photoId}/url`);
      expect(api.get).toHaveBeenNthCalledWith(3, `/galleries/${galleryId}/photos/urls`);
      expect(url).toEqual(urlResponse.data);
      expect(direct).toEqual(directResponse.data);
      expect(all).toEqual(allResponse.data);
    });
  });

  describe('uploadPhotos', () => {
    const galleryId = 'gallery-456';

    const makeFile = (name: string, size = 100) =>
      new File([new ArrayBuffer(size)], name, { type: 'image/jpeg' });

    it('returns early when no files provided', async () => {
      const result = await photoService.uploadPhotos(galleryId, []);

      expect(result).toEqual({
        results: [],
        total_files: 0,
        successful_uploads: 0,
        failed_uploads: 0,
      });
      expect(api.post).not.toHaveBeenCalled();
    });

    it('uploads batches and reports progress', async () => {
      const files = [makeFile('a.jpg', 200), makeFile('b.jpg', 300)];

      vi.mocked(api.post).mockImplementation(async (_url, _formData, config) => {
        config?.onUploadProgress?.({ loaded: 100, total: 200 } as any);
        config?.onUploadProgress?.({ loaded: 150 } as any);

        return {
          data: {
            results: files.map((f) => ({ filename: f.name, success: true })),
            successful_uploads: files.length,
            failed_uploads: 0,
          },
        } as any;
      });

      const progressSpy = vi.fn();
      const result = await photoService.uploadPhotos(galleryId, files, progressSpy);

      expect(api.post).toHaveBeenCalledWith(
        `/galleries/${galleryId}/photos/batch`,
        expect.any(FormData),
        expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
      );
      expect(progressSpy).toHaveBeenCalled();
      expect(result.successful_uploads).toBe(2);
      expect(result.failed_uploads).toBe(0);
      expect(result.results).toHaveLength(2);
    });

    it('handles batch failures gracefully', async () => {
      const files = [makeFile('c.jpg')];

      vi.mocked(api.post).mockRejectedValue(new Error('fail'));

      const progressSpy = vi.fn();
      const result = await photoService.uploadPhotos(galleryId, files, progressSpy);

      expect(progressSpy).toHaveBeenCalled();
      expect(result.successful_uploads).toBe(0);
      expect(result.failed_uploads).toBe(1);
      expect(result.results[0].success).toBe(false);
    });
  });
});
