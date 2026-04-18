import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareLinkDetailPage } from '../../pages/ShareLinkDetailPage';
import { shareLinkService } from '../../services/shareLinkService';

vi.mock('../../services/shareLinkService', () => ({
  shareLinkService: {
    getShareLinkAnalytics: vi.fn(),
    getOwnerSelectionDetail: vi.fn(),
    getOwnerSelectionSessionDetail: vi.fn(),
    updateShareLink: vi.fn(),
    deleteShareLink: vi.fn(),
    updateOwnerSelectionConfig: vi.fn(),
    updateShareLinkSelectionConfig: vi.fn(),
    closeOwnerSelectionSession: vi.fn(),
    reopenOwnerSelectionSession: vi.fn(),
    exportShareLinkSelectionFilesCsv: vi.fn(),
    exportShareLinkSelectionLightroom: vi.fn(),
  },
}));

vi.mock('../../hooks', () => ({
  useConfirmation: () => ({
    openConfirm: vi.fn(),
    ConfirmModal: null,
  }),
}));

describe('ShareLinkDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(shareLinkService.getShareLinkAnalytics).mockResolvedValue({
      share_link: {
        id: 'link-1',
        gallery_id: 'gallery-1',
        gallery_name: 'Spring Session',
        label: 'Client proofing',
        is_active: true,
        expires_at: null,
        views: 12,
        zip_downloads: 2,
        single_downloads: 3,
        created_at: '2026-04-10T10:00:00Z',
        updated_at: '2026-04-12T10:00:00Z',
      },
      selection_summary: {
        is_enabled: true,
        status: 'in_progress',
        total_sessions: 1,
        submitted_sessions: 0,
        in_progress_sessions: 1,
        closed_sessions: 0,
        selected_count: 3,
        latest_activity_at: '2026-04-12T10:00:00Z',
      },
      points: [
        {
          day: '2026-04-10',
          views_total: 5,
          views_unique: 4,
          zip_downloads: 1,
          single_downloads: 1,
        },
        {
          day: '2026-04-11',
          views_total: 7,
          views_unique: 6,
          zip_downloads: 1,
          single_downloads: 2,
        },
      ],
    } as any);

    vi.mocked(shareLinkService.getOwnerSelectionDetail).mockResolvedValue({
      sharelink_id: 'link-1',
      sharelink_label: 'Client proofing',
      scope_type: 'gallery',
      config: {
        is_enabled: true,
        list_title: 'Selected photos',
        limit_enabled: false,
        limit_value: null,
        allow_photo_comments: true,
        require_email: false,
        require_phone: false,
        require_client_note: false,
        created_at: '2026-04-10T10:00:00Z',
        updated_at: '2026-04-12T10:00:00Z',
      },
      aggregate: {
        total_sessions: 1,
        submitted_sessions: 0,
        in_progress_sessions: 1,
        closed_sessions: 0,
        selected_count: 3,
        latest_activity_at: '2026-04-12T10:00:00Z',
      },
      sessions: [
        {
          id: 'session-1',
          sharelink_id: 'link-1',
          status: 'in_progress',
          client_name: 'Ivan',
          client_email: null,
          client_phone: null,
          client_note: null,
          selected_count: 3,
          submitted_at: null,
          last_activity_at: '2026-04-12T10:00:00Z',
          created_at: '2026-04-10T10:00:00Z',
          updated_at: '2026-04-12T10:00:00Z',
          items: [],
        },
      ],
      session: null,
    } as any);

    vi.mocked(shareLinkService.getOwnerSelectionSessionDetail).mockResolvedValue({
      id: 'session-1',
      sharelink_id: 'link-1',
      status: 'in_progress',
      client_name: 'Ivan',
      client_email: null,
      client_phone: null,
      client_note: null,
      selected_count: 3,
      submitted_at: null,
      last_activity_at: '2026-04-12T10:00:00Z',
      created_at: '2026-04-10T10:00:00Z',
      updated_at: '2026-04-12T10:00:00Z',
      items: [],
    } as any);
  });

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={['/share-links/link-1']}>
        <Routes>
          <Route path="/share-links/:shareLinkId" element={<ShareLinkDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

  it('shows overview first and keeps selection admin behind its own tab', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: /client proofing/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument();
    expect(shareLinkService.getOwnerSelectionDetail).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/manage selection configuration and per-client selection sessions/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/recent daily activity/i)).toBeInTheDocument();
  });

  it('switches between analytics and selection tabs', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: /client proofing/i });

    await user.click(screen.getByRole('tab', { name: /daily analytics/i }));
    expect(await screen.findByText(/daily analytics breakdown/i)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /views total/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /photo selection/i }));
    expect(
      await screen.findByText(/manage selection configuration and per-client selection sessions/i),
    ).toBeInTheDocument();
    expect(shareLinkService.getOwnerSelectionDetail).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /save selection settings/i })).toBeInTheDocument();
  });

  it('does not refetch heavy selection detail when leaving and returning to the tab', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: /client proofing/i });

    await user.click(screen.getByRole('tab', { name: /photo selection/i }));
    await screen.findByText(/manage selection configuration and per-client selection sessions/i);
    expect(shareLinkService.getOwnerSelectionDetail).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('tab', { name: /overview/i }));
    await user.click(screen.getByRole('tab', { name: /photo selection/i }));

    expect(shareLinkService.getOwnerSelectionDetail).toHaveBeenCalledTimes(1);
  });

  it('does not retry-loop heavy selection loading after a failure', async () => {
    const user = userEvent.setup();
    vi.mocked(shareLinkService.getOwnerSelectionDetail).mockRejectedValueOnce(
      new Error('selection failed'),
    );

    renderPage();

    await screen.findByRole('heading', { name: /client proofing/i });
    await user.click(screen.getByRole('tab', { name: /photo selection/i }));

    expect(
      await screen.findByRole('button', { name: /retry selection load/i }),
    ).toBeInTheDocument();
    expect(shareLinkService.getOwnerSelectionDetail).toHaveBeenCalledTimes(1);
  });

  it('loads analytics for the default 30 day window', async () => {
    renderPage();

    await waitFor(() => {
      expect(shareLinkService.getShareLinkAnalytics).toHaveBeenCalledWith('link-1', 30);
    });
  });

  it('shows project-scoped selection management in the dedicated tab', async () => {
    vi.mocked(shareLinkService.getShareLinkAnalytics).mockResolvedValueOnce({
      share_link: {
        id: 'link-project',
        scope_type: 'project',
        project_id: 'project-1',
        project_name: 'Wedding Weekend',
        label: 'Project delivery',
        is_active: true,
        expires_at: null,
        views: 12,
        zip_downloads: 2,
        single_downloads: 0,
        created_at: '2026-04-10T10:00:00Z',
        updated_at: '2026-04-12T10:00:00Z',
      },
      selection_summary: {
        is_enabled: true,
        status: 'submitted',
        total_sessions: 2,
        submitted_sessions: 1,
        in_progress_sessions: 1,
        closed_sessions: 0,
        selected_count: 6,
        latest_activity_at: '2026-04-12T10:00:00Z',
      },
      points: [
        {
          day: '2026-04-10',
          views_total: 5,
          views_unique: 4,
          zip_downloads: 1,
          single_downloads: 0,
        },
      ],
    } as any);
    vi.mocked(shareLinkService.getOwnerSelectionDetail).mockResolvedValueOnce({
      sharelink_id: 'link-project',
      sharelink_label: 'Project delivery',
      scope_type: 'project',
      project_name: 'Wedding Weekend',
      config: {
        is_enabled: true,
        list_title: 'Selected photos',
        limit_enabled: false,
        limit_value: null,
        allow_photo_comments: true,
        require_email: false,
        require_phone: false,
        require_client_note: false,
        created_at: '2026-04-10T10:00:00Z',
        updated_at: '2026-04-12T10:00:00Z',
      },
      aggregate: {
        total_sessions: 2,
        submitted_sessions: 1,
        in_progress_sessions: 1,
        closed_sessions: 0,
        selected_count: 6,
        latest_activity_at: '2026-04-12T10:00:00Z',
      },
      sessions: [
        {
          id: 'project-session-1',
          status: 'submitted',
          client_name: 'Anna',
          client_email: null,
          client_phone: null,
          client_note: null,
          selected_count: 2,
          submitted_at: '2026-04-12T10:00:00Z',
          last_activity_at: '2026-04-12T10:00:00Z',
          created_at: '2026-04-12T09:00:00Z',
          updated_at: '2026-04-12T10:00:00Z',
        },
      ],
      session: null,
    } as any);
    vi.mocked(shareLinkService.getOwnerSelectionSessionDetail).mockResolvedValueOnce({
      id: 'project-session-1',
      sharelink_id: 'link-project',
      status: 'submitted',
      client_name: 'Anna',
      client_email: null,
      client_phone: null,
      client_note: null,
      selected_count: 2,
      submitted_at: '2026-04-12T10:00:00Z',
      last_activity_at: '2026-04-12T10:00:00Z',
      created_at: '2026-04-12T09:00:00Z',
      updated_at: '2026-04-12T10:00:00Z',
      items: [
        {
          photo_id: 'photo-1',
          photo_display_name: '001.jpg',
          gallery_name: 'Ceremony',
          comment: null,
          selected_at: '2026-04-12T09:10:00Z',
          updated_at: '2026-04-12T09:10:00Z',
        },
        {
          photo_id: 'photo-2',
          photo_display_name: '002.jpg',
          gallery_name: 'Portraits',
          comment: 'Retouch',
          selected_at: '2026-04-12T09:15:00Z',
          updated_at: '2026-04-12T09:15:00Z',
        },
      ],
    } as any);

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/share-links/link-project']}>
        <Routes>
          <Route path="/share-links/:shareLinkId" element={<ShareLinkDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: /project delivery/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /daily analytics/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /photo selection/i })).toBeInTheDocument();
    expect(
      screen.getByText(/shared photo-selection flow across all listed galleries/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open selection/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /photo selection/i }));

    expect(
      await screen.findByText(/manage selection configuration and per-client selection sessions/i),
    ).toBeInTheDocument();
    expect(shareLinkService.getOwnerSelectionDetail).toHaveBeenCalledWith('link-project');
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(await screen.findByText('Ceremony')).toBeInTheDocument();
    expect(screen.getByText('Portraits')).toBeInTheDocument();
  });
});
