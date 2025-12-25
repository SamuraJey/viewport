import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shareLinkService } from '../../services/shareLinkService';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('shareLinkService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches share links', async () => {
    const galleryId = 'g1';
    const mockLinks = [{ id: 's1' }];
    vi.mocked(api.get).mockResolvedValue({ data: mockLinks } as any);

    const result = await shareLinkService.getShareLinks(galleryId);

    expect(api.get).toHaveBeenCalledWith(`/galleries/${galleryId}/share-links`);
    expect(result).toEqual(mockLinks);
  });

  it('creates and deletes a share link', async () => {
    const galleryId = 'g1';
    const createdLink = { id: 's2', gallery_id: galleryId };
    vi.mocked(api.post).mockResolvedValue({ data: createdLink } as any);
    vi.mocked(api.delete).mockResolvedValue({} as any);

    const created = await shareLinkService.createShareLink(galleryId);
    await shareLinkService.deleteShareLink(galleryId, created.id);

    expect(api.post).toHaveBeenCalledWith(`/galleries/${galleryId}/share-links`, {
      gallery_id: galleryId,
      expires_at: null,
    });
    expect(api.delete).toHaveBeenCalledWith(`/galleries/${galleryId}/share-links/${created.id}`);
    expect(created).toEqual(createdLink);
  });

  it('fetches shared gallery with pagination params', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { photos: [], total_photos: 0 } } as any);

    const result = await shareLinkService.getSharedGallery('share123', { limit: 10, offset: 20 });

    expect(api.get).toHaveBeenCalledWith('/s/share123?limit=10&offset=20');
    expect(result).toEqual({ photos: [], total_photos: 0 });
  });

  it('fetches public photo urls', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { url: '/photo.jpg', expires_in: 60 } } as any)
      .mockResolvedValueOnce({ data: [{ photo_id: 'p1', full_url: '/p1' }] } as any);

    const urlResponse = await shareLinkService.getPublicPhotoUrl('share123', 'p1');
    const batchResponse = await shareLinkService.getAllPublicPhotoUrls('share123');

    expect(api.get).toHaveBeenNthCalledWith(1, '/s/share123/photos/p1/url');
    expect(api.get).toHaveBeenNthCalledWith(2, '/s/share123/photos/urls');
    expect(urlResponse).toEqual({ url: '/photo.jpg', expires_in: 60 });
    expect(batchResponse).toEqual([{ photo_id: 'p1', full_url: '/p1' }]);
  });
});
