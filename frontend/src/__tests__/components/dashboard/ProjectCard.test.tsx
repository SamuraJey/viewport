import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ProjectCard } from '../../../components/dashboard/ProjectCard';
import type { Project } from '../../../types';

const project: Project = {
  id: 'project-card-test',
  owner_id: 'owner-test',
  name: 'North Sea Editorial Delivery With A Deliberately Long Name',
  created_at: '2026-07-20T09:00:00Z',
  shooting_date: '2026-07-19',
  manual_order: 2,
  gallery_count: 3,
  visible_gallery_count: 2,
  total_photo_count: 812,
  total_size_bytes: 1_159_641_088,
  has_active_share_links: true,
  active_share_link_count: 3,
  latest_share_link_id: 'latest-share',
  active_viewers_count: 2,
  last_activity_at: '2026-07-23T10:00:00Z',
  cover_photo_thumbnail_url: 'https://example.com/cover.jpg',
  preview_thumbnail_urls: [
    'https://example.com/one.jpg',
    'https://example.com/two.jpg',
    'https://example.com/three.jpg',
    'https://example.com/four.jpg',
  ],
  cover_photo_id: 'cover-photo',
  cover_focal_x: 38,
  cover_focal_y: 62,
  cover_display_option: 'centered_title',
  public_photo_spacing: 'medium',
  public_color_scheme: 'light',
};

const callbacks = {
  onCopyLink: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenShare: vi.fn(),
  onRename: vi.fn(),
  onAddGallery: vi.fn(),
  onCreateShareLink: vi.fn(),
  onSettings: vi.fn(),
  onDelete: vi.fn(),
};

describe('ProjectCard', () => {
  beforeAll(() => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-23T12:00:00Z').getTime());
  });

  it('renders the complete visual and accessibility contract', () => {
    const { container } = render(
      <MemoryRouter>
        <ProjectCard project={project} {...callbacks} />
      </MemoryRouter>,
    );

    const article = screen.getByRole('article', {
      name: /North Sea Editorial.*3 galleries, 812 photos, 3 active share links/i,
    });
    expect(article).toBeInTheDocument();
    expect(screen.getByText('2 watching')).toBeInTheDocument();
    expect(screen.getByText('812')).toBeInTheDocument();
    expect(screen.getByText('1.08 GB')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveAttribute('title', project.name);
    expect(screen.getByLabelText(`Project actions for ${project.name}`)).toBeInTheDocument();

    fireEvent.mouseEnter(article);
    expect(container.querySelectorAll('img')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Copy latest project share link' })).toBeEnabled();
    expect(container.firstChild).toMatchSnapshot();
  });
});
