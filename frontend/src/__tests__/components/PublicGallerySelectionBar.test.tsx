import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PublicGallerySelectionBar } from '../../components/public-gallery/PublicGallerySelectionBar';
import type { SelectionConfig, SelectionSession } from '../../types';

const config: SelectionConfig = {
  is_enabled: true,
  list_title: 'Selected photos',
  limit_enabled: true,
  limit_value: 10,
  allow_photo_comments: false,
  require_name: true,
  require_email: false,
  require_phone: false,
  require_client_note: false,
  created_at: '2026-07-28T00:00:00Z',
  updated_at: '2026-07-28T00:00:00Z',
};

const session: SelectionSession = {
  id: 'session-1',
  sharelink_id: 'share-1',
  status: 'in_progress',
  client_name: 'Client',
  client_email: null,
  client_phone: null,
  client_note: null,
  selected_count: 4,
  submitted_at: null,
  last_activity_at: '2026-07-28T00:00:00Z',
  created_at: '2026-07-28T00:00:00Z',
  updated_at: '2026-07-28T00:00:00Z',
  resume_token: 'resume-token',
  items: [],
};

describe('PublicGallerySelectionBar', () => {
  it('renders limited selection progress and both in-progress actions', () => {
    const onOpenFavorites = vi.fn();
    const onFinishSelection = vi.fn();
    render(
      <PublicGallerySelectionBar
        config={config}
        session={session}
        isMutating={false}
        onOpenFavorites={onOpenFavorites}
        onFinishSelection={onFinishSelection}
      />,
    );

    expect(screen.getByText('4 of 10 selected')).toBeInTheDocument();
    expect(screen.getByText('Selection in progress')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');

    fireEvent.click(screen.getByRole('button', { name: /open favorites/i }));
    fireEvent.click(screen.getByRole('button', { name: /finish selection/i }));
    expect(onOpenFavorites).toHaveBeenCalledOnce();
    expect(onFinishSelection).toHaveBeenCalledOnce();
  });

  it('clamps inconsistent progress values to the accessible 0–100 range', () => {
    const { rerender } = render(
      <PublicGallerySelectionBar
        config={config}
        session={{ ...session, selected_count: 20 }}
        isMutating={false}
        onOpenFavorites={vi.fn()}
        onFinishSelection={vi.fn()}
      />,
    );

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

    rerender(
      <PublicGallerySelectionBar
        config={config}
        session={{ ...session, selected_count: -2 }}
        isMutating={false}
        onOpenFavorites={vi.fn()}
        onFinishSelection={vi.fn()}
      />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it.each([
    ['submitted', 'Selection submitted'],
    ['closed', 'Selection closed'],
  ] as const)('shows readable %s status without a finish action', (status, label) => {
    render(
      <PublicGallerySelectionBar
        config={{ ...config, limit_enabled: false, limit_value: null }}
        session={{ ...session, status, selected_count: 0 }}
        isMutating={false}
        onOpenFavorites={vi.fn()}
        onFinishSelection={vi.fn()}
      />,
    );

    expect(screen.getByText('0 selected')).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open favorites/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /finish selection/i })).not.toBeInTheDocument();
  });
});
