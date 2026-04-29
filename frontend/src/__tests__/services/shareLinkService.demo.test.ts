import { beforeEach, describe, expect, it, vi } from 'vitest';

const demoService = vi.hoisted(() => ({
  downloadGalleryZip: vi.fn(),
  downloadSharedGalleryZip: vi.fn(),
}));

vi.mock('../../lib/demoMode', () => ({
  isDemoModeEnabled: vi.fn(() => true),
}));

vi.mock('../../services/demoService', () => ({
  getDemoService: () => demoService,
}));

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
    head: vi.fn(),
    getUri: vi.fn(({ url }: { url: string }) => `/api${url}`),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { shareLinkService } from '../../services/shareLinkService';

describe('shareLinkService demo mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloads project-share gallery ZIPs by gallery id in demo mode', async () => {
    await shareLinkService.downloadSharedProjectGalleryZip('share-id', 'gallery-id');

    expect(demoService.downloadGalleryZip).toHaveBeenCalledWith('gallery-id');
    expect(demoService.downloadSharedGalleryZip).not.toHaveBeenCalled();
  });
});
