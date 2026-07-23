import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SortableProjectGalleryGrid } from '../../../components/project-page/components/SortableProjectGalleryGrid';
import {
  applyProjectGalleryOrder,
  describeGalleryDragStart,
} from '../../../components/project-page/projectGalleryDnd';
import type { ProjectDetail, ProjectGallerySummary } from '../../../types';

const makeGallery = (id: string, name: string, projectPosition: number): ProjectGallerySummary => ({
  id,
  owner_id: 'user-1',
  project_id: 'project-1',
  project_name: 'Wedding Weekend',
  project_position: projectPosition,
  project_visibility: 'listed',
  name,
  created_at: '2026-07-23T10:00:00Z',
  shooting_date: '2026-07-23',
  cover_photo_id: null,
  photo_count: 0,
  total_size_bytes: 0,
  has_active_share_links: false,
  cover_photo_thumbnail_url: null,
});

const galleries = [
  makeGallery('gallery-1', 'Ceremony', 0),
  makeGallery('gallery-2', 'Reception', 1),
];

describe('SortableProjectGalleryGrid', () => {
  it('supports keyboard pickup and announces a gallery name and position', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();

    render(
      <SortableProjectGalleryGrid
        galleries={galleries}
        onMove={onMove}
        renderGallery={(gallery, _index, dragHandle) => (
          <article>
            {dragHandle}
            <h2>{gallery.name}</h2>
          </article>
        )}
      />,
    );

    const handle = screen.getByRole('button', { name: 'Move Ceremony' });
    act(() => handle.focus());
    await user.keyboard(' ');

    expect(handle).toHaveAttribute('aria-pressed', 'true');
    expect(describeGalleryDragStart(galleries, 'gallery-1')).toBe(
      'Picked up Ceremony, position 1 of 2.',
    );

    await user.keyboard('{Escape}');
    expect(handle).not.toHaveAttribute('aria-pressed', 'true');
    expect(onMove).not.toHaveBeenCalled();
  });

  it('disables every drag handle while a reorder is being saved', () => {
    render(
      <SortableProjectGalleryGrid
        galleries={galleries}
        disabled
        onMove={vi.fn()}
        renderGallery={(gallery, _index, dragHandle) => (
          <article>
            {dragHandle}
            <h2>{gallery.name}</h2>
          </article>
        )}
      />,
    );

    expect(screen.getByRole('button', { name: 'Move Ceremony' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Reception' })).toBeDisabled();
  });

  it('moves a gallery with the keyboard and calls the reorder boundary', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        const left = this.querySelector('[data-gallery-id="gallery-2"]') ? 220 : 0;
        return {
          x: left,
          y: 0,
          top: 0,
          right: left + 200,
          bottom: 160,
          left,
          width: 200,
          height: 160,
          toJSON: () => undefined,
        };
      });

    render(
      <SortableProjectGalleryGrid
        galleries={galleries}
        onMove={onMove}
        renderGallery={(gallery, _index, dragHandle) => (
          <article data-gallery-id={gallery.id}>
            {dragHandle}
            <h2>{gallery.name}</h2>
          </article>
        )}
      />,
    );

    const handle = screen.getByRole('button', { name: 'Move Ceremony' });
    act(() => handle.focus());
    await user.keyboard(' ');
    await user.keyboard('{ArrowRight}');
    await user.keyboard(' ');

    expect(onMove).toHaveBeenCalledWith(galleries[0], 1);
    rectSpy.mockRestore();
  });
});

describe('applyProjectGalleryOrder', () => {
  it('preserves galleries loaded while a reorder is in flight', () => {
    const lateGallery = makeGallery('gallery-3', 'After Party', 2);
    const project = {
      id: 'project-1',
      galleries: [...galleries, lateGallery],
    } as ProjectDetail;

    const reordered = applyProjectGalleryOrder(project, ['gallery-2', 'gallery-1']);

    expect(reordered.galleries.map((gallery) => gallery.id)).toEqual([
      'gallery-2',
      'gallery-1',
      'gallery-3',
    ]);
    expect(reordered.galleries.map((gallery) => gallery.project_position)).toEqual([0, 1, 2]);
    expect(reordered.entry_gallery_id).toBe('gallery-2');
  });
});
