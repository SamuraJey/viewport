import { describe, it, expect, vi, beforeEach } from 'vitest';
import { galleryService } from '../../services/galleryService';
import { api } from '../../lib/api';

// Mock the api module
vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('galleryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getGalleries', () => {
    it('should make GET request to /galleries with default pagination', async () => {
      const mockResponse = {
        data: {
          galleries: [
            {
              id: '1',
              owner_id: 'user1',
              created_at: '2025-01-01T00:00:00Z',
              shooting_date: '2025-01-01',
            },
          ],
          total: 1,
          page: 1,
          size: 10,
        },
      };

      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await galleryService.getGalleries();

      expect(api.get).toHaveBeenCalledWith('/galleries?page=1&size=10');
      expect(result).toEqual(mockResponse.data);
    });

    it('should make GET request with custom pagination', async () => {
      const mockResponse = {
        data: {
          galleries: [],
          total: 0,
          page: 2,
          size: 5,
        },
      };

      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await galleryService.getGalleries(2, 5);

      expect(api.get).toHaveBeenCalledWith('/galleries?page=2&size=5');
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle getGalleries errors', async () => {
      const mockError = new Error('Failed to fetch galleries');
      vi.mocked(api.get).mockRejectedValue(mockError);

      await expect(galleryService.getGalleries()).rejects.toThrow('Failed to fetch galleries');
    });
  });

  describe('getGallery', () => {
    it('should make GET request to /galleries/:id', async () => {
      const galleryId = 'gallery-123';
      const mockResponse = {
        data: {
          id: galleryId,
          owner_id: 'user1',
          created_at: '2025-01-01T00:00:00Z',
          shooting_date: '2025-01-01',
          photos: [
            {
              id: 'photo1',
              gallery_id: galleryId,
              url: '/photos/photo1',
              file_size: 1024,
              uploaded_at: '2025-01-01T00:00:00Z',
            },
          ],
          share_links: [
            {
              id: 'link1',
              gallery_id: galleryId,
              url: 'https://example.com/share/link1',
              created_at: '2025-01-01T00:00:00Z',
            },
          ],
        },
      };

      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await galleryService.getGallery(galleryId);

      expect(api.get).toHaveBeenCalledWith(`/galleries/${galleryId}`);
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle getGallery errors', async () => {
      const galleryId = 'non-existent';
      const mockError = new Error('Gallery not found');
      vi.mocked(api.get).mockRejectedValue(mockError);

      await expect(galleryService.getGallery(galleryId)).rejects.toThrow('Gallery not found');
      expect(api.get).toHaveBeenCalledWith(`/galleries/${galleryId}`);
    });
  });

  describe('createGallery', () => {
    it('should make POST request to /galleries with provided name', async () => {
      const name = 'My Gallery';
      const mockResponse = {
        data: {
          id: 'new-gallery-123',
          owner_id: 'user1',
          created_at: '2025-01-01T00:00:00Z',
          shooting_date: '2025-01-01',
        },
      };

      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await galleryService.createGallery(name);

      expect(api.post).toHaveBeenCalledWith('/galleries', { name });
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle createGallery errors', async () => {
      const name = 'Error Gallery';
      const mockError = new Error('Failed to create gallery');
      vi.mocked(api.post).mockRejectedValue(mockError);

      await expect(galleryService.createGallery(name)).rejects.toThrow('Failed to create gallery');
      expect(api.post).toHaveBeenCalledWith('/galleries', { name });
    });

    it('should send shooting_date when provided', async () => {
      const payload = { name: 'With Date', shooting_date: '2024-05-12' };
      const mockResponse = {
        data: {
          id: 'with-date',
          owner_id: 'user1',
          created_at: '2024-01-01T00:00:00Z',
          shooting_date: payload.shooting_date,
        },
      };
      vi.mocked(api.post).mockResolvedValue(mockResponse as any);

      const result = await galleryService.createGallery(payload);

      expect(api.post).toHaveBeenCalledWith('/galleries', payload);
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('deleteGallery', () => {
    it('should make DELETE request to /galleries/:id', async () => {
      const galleryId = 'gallery-to-delete';

      vi.mocked(api.delete).mockResolvedValue({} as any);

      await galleryService.deleteGallery(galleryId);

      expect(api.delete).toHaveBeenCalledWith(`/galleries/${galleryId}`);
    });

    it('should handle deleteGallery errors', async () => {
      const galleryId = 'non-existent';
      const mockError = new Error('Gallery not found');
      vi.mocked(api.delete).mockRejectedValue(mockError);

      await expect(galleryService.deleteGallery(galleryId)).rejects.toThrow('Gallery not found');
      expect(api.delete).toHaveBeenCalledWith(`/galleries/${galleryId}`);
    });
  });

  describe('updateGallery', () => {
    it('should make PATCH request to /galleries/:id with name', async () => {
      const galleryId = 'gallery-1';
      const newName = 'Updated';
      const mockResponse = {
        data: {
          id: galleryId,
          owner_id: 'user1',
          name: newName,
          created_at: '2025-01-01T00:00:00Z',
          shooting_date: '2025-01-02',
        },
      };

      vi.mocked(api.patch).mockResolvedValue(mockResponse);

      const result = await galleryService.updateGallery(galleryId, newName);

      expect(api.patch).toHaveBeenCalledWith(`/galleries/${galleryId}`, { name: newName });
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle updateGallery errors', async () => {
      const galleryId = 'gallery-error';
      const newName = 'Name';
      const mockError = new Error('Update failed');
      vi.mocked(api.patch).mockRejectedValue(mockError);

      await expect(galleryService.updateGallery(galleryId, newName)).rejects.toThrow(
        'Update failed',
      );
      expect(api.patch).toHaveBeenCalledWith(`/galleries/${galleryId}`, { name: newName });
    });

    it('should send shooting_date when provided', async () => {
      const galleryId = 'gallery-2';
      const payload = { shooting_date: '2024-06-10' };
      const mockResponse = {
        data: {
          id: galleryId,
          owner_id: 'user1',
          name: 'Name',
          created_at: '2024-01-01T00:00:00Z',
          shooting_date: payload.shooting_date,
        },
      };

      vi.mocked(api.patch).mockResolvedValue(mockResponse as any);

      const result = await galleryService.updateGallery(galleryId, payload);

      expect(api.patch).toHaveBeenCalledWith(`/galleries/${galleryId}`, payload);
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('service methods', () => {
    it('should have all required methods', () => {
      expect(typeof galleryService.getGalleries).toBe('function');
      expect(typeof galleryService.getGallery).toBe('function');
      expect(typeof galleryService.createGallery).toBe('function');
      expect(typeof galleryService.deleteGallery).toBe('function');
      expect(typeof galleryService.updateGallery).toBe('function');
    });
  });
});
