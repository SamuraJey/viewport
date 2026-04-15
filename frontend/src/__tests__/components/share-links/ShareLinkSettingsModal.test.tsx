import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareLinkSettingsModal } from '../../../components/share-links/ShareLinkSettingsModal';
import type { ShareLink } from '../../../types';

const createdLink: ShareLink = {
  id: 'created-link',
  label: null,
  is_active: true,
  expires_at: null,
  views: 0,
  zip_downloads: 0,
  single_downloads: 0,
  created_at: '2026-04-15T10:00:00Z',
  updated_at: '2026-04-15T10:00:00Z',
};

describe('ShareLinkSettingsModal', () => {
  it('renders the complete creation setup before creating a link', () => {
    render(
      <ShareLinkSettingsModal
        isOpen
        mode="create"
        galleryName="Client Gallery"
        onClose={vi.fn()}
        onCreate={vi.fn().mockResolvedValue(createdLink)}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: /create share link/i });
    expect(within(dialog).getByText('Link identity')).toBeInTheDocument();
    expect(within(dialog).getByText('Availability')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Expiration')[0]).toBeInTheDocument();
    expect(within(dialog).getByText('Client photo selection')).toBeInTheDocument();
    expect(within(dialog).getByText('Review')).toBeInTheDocument();
  });

  it('creates an active no-expiration link by submitting the visible setup', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(createdLink);

    render(
      <ShareLinkSettingsModal
        isOpen
        mode="create"
        galleryName="Client Gallery"
        onClose={vi.fn()}
        onCreate={onCreate}
      />,
    );

    await user.type(screen.getByLabelText(/share link internal label/i), 'Client proofing');
    await user.click(screen.getByRole('button', { name: /create link/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        label: 'Client proofing',
        is_active: true,
        expires_at: null,
      });
    });
    expect(await screen.findByText('Share link created')).toBeInTheDocument();
  });

  it('supports creating a paused draft link', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ ...createdLink, is_active: false });

    render(
      <ShareLinkSettingsModal
        isOpen
        mode="create"
        galleryName="Client Gallery"
        onClose={vi.fn()}
        onCreate={onCreate}
      />,
    );

    await user.click(screen.getByRole('button', { name: /create paused/i }));
    await user.click(screen.getByRole('button', { name: /create link/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        label: null,
        is_active: false,
        expires_at: null,
      });
    });
  });

  it('saves configured selection settings after creating the link', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(createdLink);
    const onSaveSelectionConfig = vi.fn().mockResolvedValue(undefined);

    render(
      <ShareLinkSettingsModal
        isOpen
        mode="create"
        galleryName="Client Gallery"
        onClose={vi.fn()}
        onCreate={onCreate}
        onSaveSelectionConfig={onSaveSelectionConfig}
      />,
    );

    await user.click(screen.getByRole('switch', { name: /enable client photo selection/i }));
    await user.click(screen.getByRole('button', { name: /create link/i }));

    await waitFor(() => {
      expect(onSaveSelectionConfig).toHaveBeenCalledWith('created-link', {
        is_enabled: true,
        list_title: 'Selected photos',
        limit_enabled: false,
        limit_value: null,
        allow_photo_comments: false,
        require_email: false,
        require_phone: false,
        require_client_note: false,
      });
    });
  });
});
