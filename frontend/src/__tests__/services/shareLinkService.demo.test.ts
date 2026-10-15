import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shareLinkService } from '../../services/shareLinkService';
import { getDemoService } from '../../services/demoService';
import { publicApi } from '../../lib/api';

vi.mock('../../lib/demoMode', () => ({ isDemoModeEnabled: () => true }));
vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  publicApi: { get: vi.fn(), head: vi.fn(), getUri: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const readBlob = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});

const options = { quality: 'publication', includeVideos: false } as const;

describe('shareLinkService demo downloads', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('estimates video bytes at original quality and creates an honest filtered manifest', async () => {
    const [link] = await getDemoService().getShareLinks('demo-gallery-fashion');
    const withVideos = await shareLinkService.estimateSharedDownload(link.id, true);
    const withoutVideos = await shareLinkService.estimateSharedDownload(link.id, false);
    const video = await shareLinkService.estimateSharedPhotoDownload(link.id, 'demo-gallery-fashion-photo-1');
    expect(withoutVideos.video_count).toBe(0);
    expect(withoutVideos.available_video_count).toBe(1);
    expect(withVideos.original_size_bytes - withoutVideos.original_size_bytes).toBe(video.original_size_bytes);
    expect(withVideos.publication_size_bytes! - withoutVideos.publication_size_bytes!).toBe(video.original_size_bytes);
    let manifest: Blob | null = null;
    let filename = '';
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      if (blob instanceof Blob) manifest = blob;
      return 'blob:demo-manifest';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      filename = this.download;
    });
    await shareLinkService.downloadSharedGalleryZip(link.id, options);
    expect(filename).toMatch(/_publication\.txt$/);
    expect(manifest).not.toBeNull();
    const content = await readBlob(manifest!);
    expect(content).toContain('Demo: sizes and archive downloads are simulated.');
    expect(content).toContain('Quality: publication');
    expect(content).toContain('_publication.jpg');
    expect(content).not.toContain('.mp4');
    expect(publicApi.head).not.toHaveBeenCalled();
    expect(publicApi.get).not.toHaveBeenCalled();
  });

  it('rejects a gallery outside the project share rather than bypassing membership', async () => {
    await expect(shareLinkService.downloadSharedProjectGalleryZip(
      'sp-demo-project-porto', 'demo-gallery-fashion', options,
    )).rejects.toMatchObject({ statusCode: 404 });
    await expect(shareLinkService.estimateSharedProjectGalleryDownload(
      'sp-demo-project-porto', 'demo-gallery-fashion', true,
    )).rejects.toMatchObject({ statusCode: 404 });
  });

  it('downloads the scoped sample photo instead of silently succeeding', async () => {
    let href = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      href = this.href;
    });
    await shareLinkService.downloadSharedPhoto(
      'sg-demo-project-porto-photos', 'demo-project-porto-photos-photo-1', options,
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(href).toMatch(/^https?:/);
    await expect(shareLinkService.downloadSharedPhoto(
      'sg-demo-project-porto-photos', 'demo-gallery-fashion-photo-1', options,
    )).rejects.toMatchObject({ statusCode: 404 });
  });
});
