import { fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { ProjectList } from '../../../components/dashboard/ProjectList';
import type { Project } from '../../../types';

describe('ProjectList', () => {
  it('shows a replacement cover after the previous URL failed without remounting the list', () => {
    const project: Project = {
      id: 'project-list-test', owner_id: 'owner-test', name: 'Test project',
      created_at: '2026-07-20T09:00:00Z', shooting_date: '2026-07-19',
      manual_order: 0, gallery_count: 1, visible_gallery_count: 1,
      total_photo_count: 1, total_size_bytes: 1000, has_active_share_links: false,
      active_share_link_count: 0, latest_share_link_id: null, active_viewers_count: 0,
      last_activity_at: '2026-07-20T09:00:00Z',
      cover_photo_thumbnail_url: '/failed-cover.jpg', preview_thumbnail_urls: [],
      cover_photo_id: 'cover-photo', cover_focal_x: 50, cover_focal_y: 50,
      cover_display_option: 'centered_title', public_photo_spacing: 'medium',
      public_color_scheme: 'light',
    };
    const actions = {
      onCopyLink: vi.fn(), onOpenProject: vi.fn(), onOpenShare: vi.fn(),
      onRename: vi.fn(), onAddGallery: vi.fn(), onCreateShareLink: vi.fn(),
      onSettings: vi.fn(), onDelete: vi.fn(),
    };
    const view = (value: Project) => (
      <MemoryRouter><ProjectList projects={[value]} {...actions} /></MemoryRouter>
    );
    const { container, rerender } = render(view(project));
    const image = container.querySelector('img')!;
    fireEvent.error(image);
    expect(image).not.toBeVisible();

    rerender(view({ ...project, name: 'Updated project name' }));
    expect(container.querySelector('img')).toBe(image);
    expect(image).not.toBeVisible();

    rerender(view({ ...project, cover_photo_thumbnail_url: '/valid-cover.jpg' }));
    const replacement = container.querySelector('img')!;
    expect(replacement).toHaveAttribute('src', '/valid-cover.jpg');
    expect(replacement).not.toBe(image);
    expect(replacement).toBeVisible();
    fireEvent.load(replacement);
    expect(replacement).toBeVisible();
  });
});
