import { describe, it, expect, vi, beforeEach } from 'vitest'
import { photoService } from '../../services/photoService'
import { api } from '../../lib/api'

// Mock the api module
vi.mock('../../lib/api', () => ({
  api: {
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('photoService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('uploadPhoto', () => {
    it('should upload photo with FormData', async () => {
      const galleryId = 'gallery-123'
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      const mockResponse = {
        data: {
          id: 'photo-123',
          gallery_id: galleryId,
          url: '/photos/photo-123',
          created_at: '2025-01-01T00:00:00Z',
        },
      }

      vi.mocked(api.post).mockResolvedValue(mockResponse)

      const result = await photoService.uploadPhoto(galleryId, mockFile)

      expect(api.post).toHaveBeenCalledWith(
        `/galleries/${galleryId}/photos`,
        expect.any(FormData),
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      )
      expect(result).toEqual(mockResponse.data)
    })

    it('should handle upload errors', async () => {
      const galleryId = 'gallery-123'
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      const mockError = new Error('Upload failed')
      vi.mocked(api.post).mockRejectedValue(mockError)

      await expect(photoService.uploadPhoto(galleryId, mockFile)).rejects.toThrow('Upload failed')
    })
  })

  describe('deletePhoto', () => {
    it('should make DELETE request to remove photo', async () => {
      const galleryId = 'gallery-123'
      const photoId = 'photo-123'
      
      vi.mocked(api.delete).mockResolvedValue({} as any)

      await photoService.deletePhoto(galleryId, photoId)

      expect(api.delete).toHaveBeenCalledWith(`/galleries/${galleryId}/photos/${photoId}`)
    })

    it('should handle delete errors', async () => {
      const galleryId = 'gallery-123'
      const photoId = 'non-existent'
      
      const mockError = new Error('Photo not found')
      vi.mocked(api.delete).mockRejectedValue(mockError)

      await expect(photoService.deletePhoto(galleryId, photoId)).rejects.toThrow('Photo not found')
      expect(api.delete).toHaveBeenCalledWith(`/galleries/${galleryId}/photos/${photoId}`)
    })
  })

  describe('service methods', () => {
    it('should have all required methods', () => {
      expect(typeof photoService.uploadPhoto).toBe('function')
      expect(typeof photoService.deletePhoto).toBe('function')
    })
  })
})
