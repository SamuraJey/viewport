import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GallerySelectionSessionsPanel } from '../../../components/gallery/GallerySelectionSessionsPanel';
import type { SelectionSession } from '../../../types';

const createSelectionSession = (count: number): SelectionSession => ({
  id: 'session-1',
  sharelink_id: 'sharelink-1',
  status: 'in_progress',
  client_name: 'Ivan',
  client_email: null,
  client_phone: null,
  client_note: null,
  selected_count: count,
  submitted_at: null,
  last_activity_at: '2026-03-31T22:07:00Z',
  created_at: '2026-03-31T22:07:00Z',
  updated_at: '2026-03-31T22:07:00Z',
  items: Array.from({ length: count }, (_, index) => ({
    photo_id: `photo-${index + 1}`,
    photo_display_name: `photo-${index + 1}.jpg`,
    photo_thumbnail_url: `/thumbs/photo-${index + 1}.jpg`,
    comment: index === 0 ? 'Picked for album' : null,
    selected_at: '2026-03-31T22:07:00Z',
    updated_at: '2026-03-31T22:07:00Z',
  })),
});

describe('GallerySelectionSessionsPanel', () => {
  it('shows session counts and paginates grid view', async () => {
    const user = userEvent.setup();
    render(
      <GallerySelectionSessionsPanel
        userTabs={[
          {
            key: 'ivan',
            clientName: 'Ivan',
            status: 'in_progress',
            selectedCount: 13,
            sessionCount: 2,
            shareLinkLabel: 'Main clients',
          },
        ]}
        selectedUserTabKey="ivan"
        selectedSession={createSelectionSession(13)}
        thumbnailByPhotoId={{}}
        isLoadingRows={false}
        isLoadingDetail={false}
        isMutating={false}
        error=""
        onSelectUserTab={vi.fn()}
        onCloseSession={vi.fn()}
        onReopenSession={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText('13 selected • 2 sessions • in_progress')).toBeInTheDocument();
    expect(screen.getByText('photo-1.jpg')).toBeInTheDocument();
    expect(screen.queryByText('photo-13.jpg')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next page/i }));

    expect(screen.getByText('photo-13.jpg')).toBeInTheDocument();
  });

  it('supports list mode pagination', async () => {
    const user = userEvent.setup();
    render(
      <GallerySelectionSessionsPanel
        userTabs={[
          {
            key: 'ivan',
            clientName: 'Ivan',
            status: 'in_progress',
            selectedCount: 16,
            sessionCount: 3,
            shareLinkLabel: 'Main clients',
          },
        ]}
        selectedUserTabKey="ivan"
        selectedSession={createSelectionSession(16)}
        thumbnailByPhotoId={{}}
        isLoadingRows={false}
        isLoadingDetail={false}
        isMutating={false}
        error=""
        onSelectUserTab={vi.fn()}
        onCloseSession={vi.fn()}
        onReopenSession={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^List$/i }));

    expect(screen.getByText('photo-15.jpg')).toBeInTheDocument();
    expect(screen.queryByText('photo-16.jpg')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next page/i }));

    expect(screen.getByText('photo-16.jpg')).toBeInTheDocument();
  });
});
