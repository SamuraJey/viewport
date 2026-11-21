import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { EnhancedGalleryCard } from '../../../components/dashboard/EnhancedGalleryCard';
import type { Gallery } from '../../../types';

const gallery: Gallery = {
  id: 'gallery-card-test',
  owner_id: 'owner-test',
  project_id: 'project-card-test',
  project_name: 'North Sea Editorial',
  project_position: 0,
  project_visibility: 'listed',
  name: 'Ceremony',
  created_at: '2026-07-20T09:00:00Z',
  shooting_date: '2026-07-19',
  public_sort_by: 'uploaded_at',
  public_sort_order: 'asc',
  cover_focal_x: 50,
  cover_focal_y: 50,
  cover_display_option: 'centered_title',
  public_photo_spacing: 'medium',
  public_color_scheme: 'light',
  cover_photo_id: 'cover-photo',
  photo_count: 42,
  total_size_bytes: 1_159_641_088,
  has_active_share_links: true,
  cover_photo_thumbnail_url: 'https://example.com/gallery-cover.jpg',
};

const variants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 200, damping: 20 },
  },
  exit: { opacity: 0, scale: 0.98, y: 10, transition: { duration: 0.15 } },
};

const baseProps = {
  gallery,
  isRenamingThis: false,
  isRenaming: false,
  onConfirmRename: vi.fn(),
  onCancelRename: vi.fn(),
  onBeginRename: vi.fn(),
  onDelete: vi.fn(),
  onShare: vi.fn(),
  variants,
};

describe('EnhancedGalleryCard', () => {
  it.each(['Enter', 'Escape'])('restores rename focus only after %s closes the editor', (key) => {
    const view = (editing: boolean, saving = false) => (
      <MemoryRouter>
        <EnhancedGalleryCard {...baseProps} isRenamingThis={editing} isRenaming={saving} />
      </MemoryRouter>
    );
    const { rerender } = render(view(true));
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key });
    expect(input).toHaveFocus();
    rerender(view(false));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename Ceremony' })).toHaveFocus();
  });

  it('waits for pending saves before enabling and focusing the rename button', () => {
    const view = (editing: boolean, saving: boolean) => (
      <MemoryRouter>
        <EnhancedGalleryCard {...baseProps} isRenamingThis={editing} isRenaming={saving} />
      </MemoryRouter>
    );
    const { rerender } = render(view(true, false));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    rerender(view(true, true));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    rerender(view(false, true));
    const button = screen.getByRole('button', { name: 'Rename Ceremony' });
    expect(button).toBeDisabled();
    expect(button).not.toHaveFocus();
    rerender(view(false, false));
    expect(button).toBeEnabled();
    expect(button).toHaveFocus();
  });

  it('preserves Tab focus after blur closes the editor', async () => {
    const user = userEvent.setup();
    const view = (editing: boolean) => (
      <MemoryRouter>
        <EnhancedGalleryCard {...baseProps} isRenamingThis={editing} />
        <button type="button">Next control</button>
      </MemoryRouter>
    );
    const { rerender } = render(view(true));
    await user.tab();
    expect(screen.getByRole('button', { name: 'Next control' })).toHaveFocus();
    rerender(view(false));
    expect(screen.getByRole('button', { name: 'Next control' })).toHaveFocus();
  });

  it('preserves gallery navigation, metadata, badges, and actions', async () => {
    const user = userEvent.setup();
    const onBeginRename = vi.fn();
    const onDelete = vi.fn();
    const onShare = vi.fn();

    render(
      <MemoryRouter>
        <EnhancedGalleryCard
          {...baseProps}
          onBeginRename={onBeginRename}
          onDelete={onDelete}
          onShare={onShare}
          extraTopBadges={<span>Visible in project</span>}
          extraActions={<button type="button">Visibility settings</button>}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/projects/project-card-test/galleries/gallery-card-test',
    );
    expect(screen.getByRole('heading', { name: 'Ceremony' })).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('1.08 GB')).toBeInTheDocument();
    expect(screen.getByText('Jul 19, 2026')).toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Visible in project')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visibility settings' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Share Ceremony' }));
    await user.click(screen.getByRole('button', { name: 'Delete Ceremony' }));
    await user.click(screen.getByRole('button', { name: 'Rename Ceremony' }));

    expect(onShare).toHaveBeenCalledWith(gallery);
    expect(onDelete).toHaveBeenCalledWith(gallery);
    expect(onBeginRename).toHaveBeenCalledWith(gallery);
  });

  it('preserves inline rename confirmation', () => {
    const onConfirmRename = vi.fn();

    render(
      <MemoryRouter>
        <EnhancedGalleryCard {...baseProps} isRenamingThis onConfirmRename={onConfirmRename} />
      </MemoryRouter>,
    );

    const input = screen.getByRole('textbox', { name: 'Rename gallery input' });
    fireEvent.change(input, { target: { value: 'Ceremony highlights' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onConfirmRename).toHaveBeenCalledExactlyOnceWith('Ceremony highlights');
  });

  it('keeps hidden navigation out of the editor and cancels with Escape', () => {
    const onCancelRename = vi.fn();
    const onConfirmRename = vi.fn();
    render(
      <MemoryRouter>
        <EnhancedGalleryCard
          {...baseProps}
          isRenamingThis
          onCancelRename={onCancelRename}
          onConfirmRename={onConfirmRename}
        />
      </MemoryRouter>,
    );
    const input = screen.getByRole('textbox', { name: 'Rename gallery input' });
    expect(input).toHaveFocus();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename Ceremony' })).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancelRename).toHaveBeenCalledOnce();
    expect(onConfirmRename).not.toHaveBeenCalled();
  });

  it('does not save while confirming an IME composition', () => {
    const onConfirmRename = vi.fn();
    render(
      <MemoryRouter>
        <EnhancedGalleryCard {...baseProps} isRenamingThis onConfirmRename={onConfirmRename} />
      </MemoryRouter>,
    );
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Rename gallery input' }), {
      key: 'Enter',
      isComposing: true,
    });
    expect(onConfirmRename).not.toHaveBeenCalled();
  });
});
