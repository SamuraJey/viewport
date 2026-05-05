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
    expect(seededProject?.gallery_count).toBe(2);

    const detail = await service.getProject(seededProject!.id);
    expect(detail.galleries.map((folder) => folder.name)).toEqual(['Photos', '3eds']);
  });

  it('sorts demo projects by supported fields and directions', async () => {
    vi.setSystemTime(new Date('2026-04-17T12:00:00.000Z'));

    const { getDemoService } = await import('../../services/demoService');
    const service = getDemoService();

    await service.createProject({ name: 'Zulu Empty', shooting_date: '2026-04-17' });
    await service.createProject({ name: 'Alpha Empty', shooting_date: '2026-04-17' });

    const nameAsc = await service.getProjects(1, 20, { sort_by: 'name', order: 'asc' });
    const nameDesc = await service.getProjects(1, 20, { sort_by: 'name', order: 'desc' });
    const shootingAsc = await service.getProjects(1, 20, {
      sort_by: 'shooting_date',
      order: 'asc',
    });
    const photoCountDesc = await service.getProjects(1, 1, {
      sort_by: 'photo_count',
      order: 'desc',
    });
    const photoCountAsc = await service.getProjects(1, 1, {
      sort_by: 'photo_count',
      order: 'asc',
    });
    const sizeDesc = await service.getProjects(1, 1, {
      sort_by: 'total_size_bytes',
      order: 'desc',
    });
    const createdAsc = await service.getProjects(1, 20, { sort_by: 'created_at', order: 'asc' });

    expect(nameAsc.projects[0].name).toBe('Alpha Empty');
    expect(nameDesc.projects[0].name).toBe('Zulu Empty');
    expect(shootingAsc.projects[0].name).toBe('Porto Wedding Delivery');
    expect(photoCountDesc.projects[0].name).toBe('Porto Wedding Delivery');
    expect(photoCountDesc.projects[0].total_photo_count).toBeGreaterThan(0);
    expect(photoCountAsc.projects[0].total_photo_count).toBe(0);
    expect(sizeDesc.projects[0].name).toBe('Porto Wedding Delivery');
    expect(createdAsc.projects[0].name).toBe('Porto Wedding Delivery');
  });

  it('creates multiple galleries inside a project in demo mode', async () => {
    const { getDemoService } = await import('../../services/demoService');
    const service = getDemoService();

    const project = await service.createProject({ name: 'Client Delivery' });

    await service.createProjectGallery(project.id, { name: 'Photos' });
    await service.createProjectGallery(project.id, { name: '3eds' });

    const detail = await service.getProject(project.id);

    expect(detail.gallery_count).toBe(2);
    expect(detail.entry_gallery_name).toBe('Photos');
    expect(detail.galleries.map((folder) => folder.name)).toEqual(['Photos', '3eds']);
  });

  it('does not surface password protection for demo shares because public demo access is not gated', async () => {
    const { getDemoService } = await import('../../services/demoService');
    const service = getDemoService();

    const project = await service.createProject({ name: 'Demo Passwords' });
    const gallery = await service.createProjectGallery(project.id, { name: 'Proofs' });

    const galleryLink = await service.createShareLink(gallery.id, { password: 'client-pass' });
    const projectLink = await service.createProjectShareLink(project.id, {
      password: 'client-pass',
    });

    expect(galleryLink.has_password).toBe(false);
    expect(projectLink.has_password).toBe(false);

    const updatedGalleryLink = await service.updateShareLink(gallery.id, galleryLink.id, {
      password: 'updated-pass',
    });
    const updatedProjectLink = await service.updateProjectShareLink(project.id, projectLink.id, {
      password: 'updated-pass',
    });

    expect(updatedGalleryLink.has_password).toBe(false);
    expect(updatedProjectLink.has_password).toBe(false);
  });

  it('supports one project selection session across multiple listed galleries in demo mode', async () => {
    const { getDemoService } = await import('../../services/demoService');
    const service = getDemoService();

    const shareLinks = await service.getProjectShareLinks('demo-project-porto-delivery');
    const projectShareLink = shareLinks.find((link) => link.id === 'sp-demo-project-porto');
    expect(projectShareLink).toBeTruthy();

    const config = await service.getPublicSelectionConfig(projectShareLink!.id);
    expect(config.is_enabled).toBe(true);

    const session = await service.startPublicSelectionSession(projectShareLink!.id, {
      client_name: 'Client Demo',
    });
    const resumeToken = session.resume_token ?? undefined;

    const project = await service.getProject('demo-project-porto-delivery');
    const projectShare = await service.getSharedGallery(projectShareLink!.id);
    const firstFolderId = project.galleries[0].id;
    const secondFolderId = project.galleries[1].id;

    if (projectShare.scope_type !== 'project') {
      throw new Error('Expected project root route to resolve to a project payload');
    }

    const listedProjectGalleries = project.galleries.filter(
      (gallery) => (gallery.project_visibility ?? 'listed') === 'listed',
    );
    expect(projectShare.total_size_bytes).toBe(
      listedProjectGalleries.reduce((sum, gallery) => sum + (gallery.total_size_bytes || 0), 0),
    );

    const firstGallery = await service.getSharedGallery(projectShareLink!.id, {
      galleryId: firstFolderId,
    });
    const secondGallery = await service.getSharedGallery(projectShareLink!.id, {
      galleryId: secondFolderId,
    });

    if (firstGallery.scope_type !== 'gallery' || secondGallery.scope_type !== 'gallery') {
      throw new Error('Expected nested project routes to resolve to gallery payloads');
    }

    expect(firstGallery.total_size_bytes).toBe(project.galleries[0].total_size_bytes);
    expect(firstGallery.project_navigation?.project_name).toBe('Porto Wedding Delivery');
    expect(firstGallery.project_navigation?.total_size_bytes).toBe(projectShare.total_size_bytes);
    expect(secondGallery.project_navigation?.folders).toHaveLength(2);

    await service.togglePublicSelectionItem(
      projectShareLink!.id,
      firstGallery.photos[0].photo_id,
      resumeToken,
    );
    await service.togglePublicSelectionItem(
      projectShareLink!.id,
      secondGallery.photos[0].photo_id,
      resumeToken,
    );

    const restoredSession = await service.getPublicSelectionSession(
      projectShareLink!.id,
      resumeToken,
    );
    expect(restoredSession.selected_count).toBe(2);
    expect(new Set(restoredSession.items.map((item) => item.gallery_name))).toEqual(
      new Set(['Photos', '3eds']),
    );

    const selectedPhotos = await service.getPublicPhotosByIds(
      projectShareLink!.id,
      restoredSession.items.map((item) => item.photo_id),
    );
    expect(selectedPhotos).toHaveLength(2);
  });

  it('matches production 404 semantics when a project share has no listed galleries', async () => {
    const { getDemoService } = await import('../../services/demoService');
    const service = getDemoService();

    const project = await service.createProject({ name: 'Hidden Project' });
    const detail = await service.getProject(project.id);

    for (const folder of detail.galleries) {
      await service.updateGallery(folder.id, { project_visibility: 'direct_only' });
    }

    const shareLink = await service.createProjectShareLink(project.id, {});

    await expect(service.getSharedGallery(shareLink.id)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('deletes a project together with its galleries and share links in demo mode', async () => {
    const { getDemoService } = await import('../../services/demoService');
    const service = getDemoService();

    const project = await service.createProject({ name: 'Delete Me' });
    const gallery = await service.createProjectGallery(project.id, { name: 'Proofs' });
    const galleryId = gallery.id;
    const projectShareLink = await service.createProjectShareLink(project.id, {});
    const galleryShareLink = await service.createShareLink(galleryId, {});

    await service.deleteProject(project.id);

    await expect(service.getProject(project.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.getGallery(galleryId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.getSharedGallery(projectShareLink.id)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.getSharedGallery(galleryShareLink.id)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
