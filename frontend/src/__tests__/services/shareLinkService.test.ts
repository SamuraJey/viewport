import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shareLinkService } from '../../services/shareLinkService';
import { api, publicApi } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  publicApi: {
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
    vi.mocked(publicApi.get).mockResolvedValue({ data: { photos: [], total_photos: 0 } } as any);

    const result = await shareLinkService.getSharedGallery('share123', {
      limit: 10,
      offset: 20,
    });

    expect(publicApi.get).toHaveBeenCalledWith('/s/share123?limit=10&offset=20', {
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    expect(result).toEqual({ photos: [], total_photos: 0 });
  });

  it('sends the internal navigation header when project gallery views should not increment analytics', async () => {
    vi.mocked(publicApi.get).mockResolvedValue({ data: { photos: [], total_photos: 0 } } as any);

    await shareLinkService.getSharedGallery('share123', {
      galleryId: 'gallery-1',
      skipProjectViewCount: true,
    });

    expect(publicApi.get).toHaveBeenCalledWith('/s/share123/galleries/gallery-1', {
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'X-Viewport-Internal-Navigation': '1',
      },
    });
  });

  it('fetches owner share links with a backend status filter', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { share_links: [], total: 0 } } as any);

    await shareLinkService.getOwnerShareLinks(2, 25, 'ivan', 'inactive');

    expect(api.get).toHaveBeenCalledWith('/share-links?page=2&size=25&search=ivan&status=inactive');
  });

  it('fetches public photo urls', async () => {
    vi.mocked(publicApi.get)
      .mockResolvedValueOnce({ data: { url: '/photo.jpg', expires_in: 60 } } as any)
      .mockResolvedValueOnce({ data: [{ photo_id: 'p1', full_url: '/p1' }] } as any);

    const urlResponse = await shareLinkService.getPublicPhotoUrl('share123', 'p1');
    const batchResponse = await shareLinkService.getAllPublicPhotoUrls('share123');

    expect(publicApi.get).toHaveBeenNthCalledWith(1, '/s/share123/photos/p1/url', {
      headers: {},
    });
    expect(publicApi.get).toHaveBeenNthCalledWith(2, '/s/share123/photos/urls', {
      headers: {},
    });
    expect(urlResponse).toEqual({ url: '/photo.jpg', expires_in: 60 });
    expect(batchResponse).toEqual([{ photo_id: 'p1', full_url: '/p1' }]);
  });

  it('fetches public photo cards by ids preserving query order', async () => {
    vi.mocked(publicApi.get).mockResolvedValue({
      data: [{ photo_id: 'p2' }, { photo_id: 'p1' }],
    } as any);

    const result = await shareLinkService.getPublicPhotosByIds('share123', ['p2', 'p1']);

    expect(publicApi.get).toHaveBeenCalledWith(
      '/s/share123/photos/by-ids?photo_ids=p2&photo_ids=p1',
      { headers: {} },
    );
    expect(result).toEqual([{ photo_id: 'p2' }, { photo_id: 'p1' }]);
  });

  it('unlocks protected shares without writing passwords to Web Storage', async () => {
    vi.mocked(publicApi.post).mockResolvedValue({} as any);

    await shareLinkService.unlockSharedGallery('share123', 'client-pass');

    expect(window.sessionStorage.setItem).not.toHaveBeenCalled();
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
    expect(publicApi.post).toHaveBeenCalledWith('/s/share123/unlock', {
      password: 'client-pass',
    });
  });

  it('does not attach plaintext passwords to public share calls after unlock', async () => {
    vi.mocked(publicApi.get).mockResolvedValue({ data: { photos: [], total_photos: 0 } } as any);

    await shareLinkService.getSharedGallery('share123');

    expect(window.sessionStorage.setItem).not.toHaveBeenCalled();
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
    expect(publicApi.get).toHaveBeenCalledWith('/s/share123', {
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
  });

  it('fetches public selection session with resume token query', async () => {
    vi.mocked(publicApi.get).mockResolvedValue({ data: { id: 'session-1' } } as any);

    const result = await shareLinkService.getPublicSelectionSession('share123', 'resume-token');

    expect(publicApi.get).toHaveBeenCalledWith(
      '/s/share123/selection/session/me?resume_token=resume-token',
      { headers: {} },
    );
    expect(result).toEqual({ id: 'session-1' });
  });

  it('toggles public selection item with resume token query', async () => {
    vi.mocked(publicApi.put).mockResolvedValue({
      data: { selected: true, selected_count: 1 },
    } as any);

    const result = await shareLinkService.togglePublicSelectionItem(
      'share123',
      'photo-1',
      'resume-token',
    );

    expect(publicApi.put).toHaveBeenCalledWith(
      '/s/share123/selection/session/items/photo-1?resume_token=resume-token',
      undefined,
      { headers: {} },
    );
    expect(result).toEqual({ selected: true, selected_count: 1 });
  });

  it('downloads public ZIP through publicApi with HttpOnly cookie credentials and response filename', async () => {
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.mocked(publicApi.get).mockResolvedValue({
      data: new Blob(['zip']),
      headers: { 'content-disposition': 'attachment; filename="client.zip"' },
    } as any);

    await shareLinkService.downloadSharedGalleryZip('share123');

    expect(publicApi.get).toHaveBeenCalledWith('/s/share123/download/all', {
      responseType: 'blob',
      headers: {},
    });
    const anchor = document.querySelector('a[download="client.zip"]');
    expect(anchor).toBeNull();
    expect(clickSpy).toHaveBeenCalled();

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    clickSpy.mockRestore();
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
