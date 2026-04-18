import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/demoMode', () => ({
  isDemoModeEnabled: vi.fn(() => true),
}));

const DEMO_STATE_STORAGE_KEY = 'viewport-demo-state-v1';

const buildDemoState = (expiresAt: string) => ({
  galleries: [
    {
      gallery: {
        id: 'gallery-1',
        owner_id: 'demo-user-1',
        name: 'Test Gallery',
        created_at: '2026-04-01T00:00:00Z',
        shooting_date: null,
        cover_photo_id: null,
        photo_count: 0,
        total_size_bytes: 0,
        has_active_share_links: true,
        cover_photo_thumbnail_url: null,
        recent_photo_thumbnail_urls: [],
      },
      photos: [],
      shareLinks: [
        {
          id: 'link-1',
          label: 'Expiring link',
          is_active: true,
          expires_at: expiresAt,
          views: 0,
          zip_downloads: 0,
          single_downloads: 0,
          created_at: '2026-04-01T00:00:00Z',
          updated_at: '2026-04-01T00:00:00Z',
        },
      ],
      selectionConfigs: {},
      selectionSessions: {},
    },
  ],
  user: {
    id: 'demo-user-1',
    email: 'demo@example.com',
    display_name: 'Demo Photographer',
    storage_used: 0,
    storage_quota: 1000,
  },
});

describe('demoService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();
  });

  it('treats a link expiring exactly now as expired', async () => {
    vi.setSystemTime(new Date('2026-04-17T12:00:00.000Z'));
    localStorage.setItem(
      DEMO_STATE_STORAGE_KEY,
      JSON.stringify(buildDemoState('2026-04-17T12:00:00.000Z')),
    );

    const { getDemoService } = await import('../../services/demoService');
    const service = getDemoService();

    const active = await service.getOwnerShareLinks(1, 20, undefined, 'active');
    const expired = await service.getOwnerShareLinks(1, 20, undefined, 'expired');

    expect(active.share_links.some((link) => link.id === 'link-1')).toBe(false);
    expect(expired.share_links.some((link) => link.id === 'link-1')).toBe(true);
  });

  it('backfills a seeded multi-gallery project for legacy demo state', async () => {
    localStorage.setItem(
      DEMO_STATE_STORAGE_KEY,
      JSON.stringify({
        galleries: buildDemoState('2026-04-17T12:00:00.000Z').galleries,
        user: buildDemoState('2026-04-17T12:00:00.000Z').user,
      }),
    );

    const { getDemoService } = await import('../../services/demoService');
    const service = getDemoService();

    const projects = await service.getProjects(1, 20);
    const seededProject = projects.projects.find(
      (project) => project.name === 'Porto Wedding Delivery',
    );

    expect(seededProject).toBeTruthy();
    expect(seededProject?.folder_count).toBe(2);

    const detail = await service.getProject(seededProject!.id);
    expect(detail.folders.map((folder) => folder.name)).toEqual(['Photos', '3eds']);
  });

  it('creates multiple galleries inside a project in demo mode', async () => {
    const { getDemoService } = await import('../../services/demoService');
    const service = getDemoService();

    const project = await service.createProject({ name: 'Client Delivery' });

    await service.createProjectFolder(project.id, { name: 'Photos' });
    await service.createProjectFolder(project.id, { name: '3eds' });

    const detail = await service.getProject(project.id);

    expect(detail.folder_count).toBe(2);
    expect(detail.folders.map((folder) => folder.name)).toEqual(['Photos', '3eds']);
  });
});
