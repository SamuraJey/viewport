import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  describeProjectDragStart,
  SortableProjectGrid,
} from '../../../components/dashboard/SortableProjectGrid';
import type { Project } from '../../../types';

const makeProject = (id: string, name: string, manualOrder: number): Project => ({
  id,
  owner_id: 'user-1',
  name,
  created_at: '2026-07-23T10:00:00Z',
  shooting_date: '2026-07-23',
  manual_order: manualOrder,
  entry_gallery_id: null,
  entry_gallery_name: null,
  gallery_count: 0,
  visible_gallery_count: 0,
  has_entry_gallery: false,
  total_photo_count: 0,
  total_size_bytes: 0,
  has_active_share_links: false,
  active_share_link_count: 0,
  latest_share_link_id: null,
  active_viewers_count: 0,
  last_activity_at: '2026-07-23T10:00:00Z',
  cover_photo_thumbnail_url: null,
  preview_thumbnail_urls: [],
  cover_photo_id: null,
  cover_focal_x: 50,
  cover_focal_y: 50,
  cover_display_option: 'centered_title',
  public_photo_spacing: 'medium',
  public_color_scheme: 'light',
});

const projects = [
  makeProject('project-1', 'Alpha Delivery', 0),
  makeProject('project-2', 'Beta Delivery', 1),
];

const actions = {
  onCopyLink: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenShare: vi.fn(),
  onRename: vi.fn(),
  onAddGallery: vi.fn(),
  onCreateShareLink: vi.fn(),
  onSettings: vi.fn(),
  onDelete: vi.fn(),
};

describe('SortableProjectGrid', () => {
  it('supports keyboard pickup and announces a project name instead of its id', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    const onAnnouncement = vi.fn();

    render(
      <MemoryRouter>
        <SortableProjectGrid
          projects={projects}
          onReorder={onReorder}
          onAnnouncement={onAnnouncement}
          {...actions}
        />
      </MemoryRouter>,
    );

    const handle = screen.getByRole('button', { name: 'Move Alpha Delivery' });
    act(() => handle.focus());
    await user.keyboard(' ');

    expect(handle).toHaveAttribute('aria-pressed', 'true');
    expect(describeProjectDragStart(projects, 'project-1')).toBe(
      'Picked up Alpha Delivery, position 1 of 2.',
    );

    await user.keyboard('{Escape}');
    expect(handle).not.toHaveAttribute('aria-pressed', 'true');
    expect(onReorder).not.toHaveBeenCalled();
    expect(onAnnouncement).not.toHaveBeenCalled();
  });
});
