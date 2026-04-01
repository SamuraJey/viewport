import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shareLinkService } from '../../services/shareLinkService';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
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
    const createdLink = { id: 's2' };
    vi.mocked(api.post).mockResolvedValue({ data: createdLink } as any);
    vi.mocked(api.delete).mockResolvedValue({} as any);

    const created = await shareLinkService.createShareLink(galleryId);
    await shareLinkService.deleteShareLink(galleryId, created.id);

    expect(api.post).toHaveBeenCalledWith(`/galleries/${galleryId}/share-links`, {
      expires_at: null,
    });
    expect(api.delete).toHaveBeenCalledWith(`/galleries/${galleryId}/share-links/${created.id}`);
    expect(created).toEqual(createdLink);
  });

  it('creates a share link with payload in a single POST', async () => {
    const galleryId = 'g1';
    const createdLink = { id: 's3' };
    vi.mocked(api.post).mockResolvedValue({ data: createdLink } as any);

    const created = await shareLinkService.createShareLink(galleryId, {
      label: 'Client preview',
      is_active: false,
      expires_at: '2026-04-01T10:00:00Z',
    });

    expect(api.post).toHaveBeenCalledWith(`/galleries/${galleryId}/share-links`, {
      label: 'Client preview',
      is_active: false,
      expires_at: '2026-04-01T10:00:00Z',
    });
    expect(created).toEqual(createdLink);
  });

  it('fetches shared gallery with pagination params', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { photos: [], total_photos: 0 } } as any);

    const result = await shareLinkService.getSharedGallery('share123', {
      limit: 10,
      offset: 20,
    });

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

  it('fetches public selection session with resume token query', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { id: 'session-1' } } as any);

    const result = await shareLinkService.getPublicSelectionSession('share123', 'resume-token');

    expect(api.get).toHaveBeenCalledWith(
      '/s/share123/selection/session/me?resume_token=resume-token',
    );
    expect(result).toEqual({ id: 'session-1' });
  });

  it('toggles public selection item with resume token query', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { selected: true, selected_count: 1 } } as any);

    const result = await shareLinkService.togglePublicSelectionItem(
      'share123',
      'photo-1',
      'resume-token',
    );

    expect(api.put).toHaveBeenCalledWith(
      '/s/share123/selection/session/items/photo-1?resume_token=resume-token',
    );
    expect(result).toEqual({ selected: true, selected_count: 1 });
  });

  it('fetches owner selection detail', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { sharelink_id: 's1', sessions: [] } } as any);

    const result = await shareLinkService.getOwnerSelectionDetail('s1');

    expect(api.get).toHaveBeenCalledWith('/share-links/s1/selection');
    expect(result).toEqual({ sharelink_id: 's1', sessions: [] });
  });

  it('fetches and mutates owner selection session endpoints', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { id: 'session-1' } } as any);
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: { id: 'session-1', status: 'closed' } } as any)
      .mockResolvedValueOnce({ data: { id: 'session-1', status: 'in_progress' } } as any);

    const detail = await shareLinkService.getOwnerSelectionSessionDetail('s1', 'session-1');
    const closed = await shareLinkService.closeOwnerSelectionSession('s1', 'session-1');
    const reopened = await shareLinkService.reopenOwnerSelectionSession('s1', 'session-1');

    expect(api.get).toHaveBeenCalledWith('/share-links/s1/selection/sessions/session-1');
    expect(api.post).toHaveBeenNthCalledWith(
      1,
      '/share-links/s1/selection/sessions/session-1/close',
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      '/share-links/s1/selection/sessions/session-1/reopen',
    );
    expect(detail).toEqual({ id: 'session-1' });
    expect(closed).toEqual({ id: 'session-1', status: 'closed' });
    expect(reopened).toEqual({ id: 'session-1', status: 'in_progress' });
  });
});
