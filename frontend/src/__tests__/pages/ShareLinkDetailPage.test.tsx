import { MemoryRouter, Route, Routes } from 'react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareLinkDetailPage } from '../../pages/ShareLinkDetailPage';
import { copyTextToClipboard } from '../../lib/clipboard';
import { shareLinkService } from '../../services/shareLinkService';
import type {
  OwnerSelectionDetail,
  OwnerSelectionSessionListItem,
  SelectionItem,
  SelectionSession,
  ShareLinkAnalyticsItem,
  ShareLinkAnalyticsResponse,
  ShareLinkSelectionSummary,
} from '../../types';

vi.mock('../../services/shareLinkService', () => ({
  shareLinkService: {
    getShareLinkAnalytics: vi.fn(),
    getOwnerSelectionDetail: vi.fn(),
    getOwnerSelectionSessionDetail: vi.fn(),
    updateShareLink: vi.fn(),
    updateProjectShareLink: vi.fn(),
    deleteShareLink: vi.fn(),
    deleteProjectShareLink: vi.fn(),
    updateOwnerSelectionConfig: vi.fn(),
    updateShareLinkSelectionConfig: vi.fn(),
    closeOwnerSelectionSession: vi.fn(),
    reopenOwnerSelectionSession: vi.fn(),
    exportShareLinkSelectionFilesCsv: vi.fn(),
    exportShareLinkSelectionLightroom: vi.fn(),
  },
}));

vi.mock('../../lib/clipboard', () => ({
  copyTextToClipboard: vi.fn(),
}));

vi.mock('../../hooks/useConfirmation', () => ({
  useConfirmation: () => ({
    openConfirm: vi.fn(),
    ConfirmModal: null,
  }),
}));

const makeSession = (
  id: string,
  clientName: string,
  options: Partial<OwnerSelectionSessionListItem> = {},
): OwnerSelectionSessionListItem => ({
  id,
  status: 'in_progress',
  client_name: clientName,
  client_email: null,
  client_phone: null,
  client_note: null,
  selected_count: 0,
  submitted_at: null,
  last_activity_at: '2026-04-12T10:00:00Z',
  created_at: '2026-04-10T10:00:00Z',
  updated_at: '2026-04-12T10:00:00Z',
  ...options,
});

const makeSessionDetail = (
  session: OwnerSelectionSessionListItem,
  items: SelectionItem[] = [],
): SelectionSession => ({
  ...session,
  sharelink_id: 'link-1',
  items,
});

const makeSelectionDetail = (
  sessions: OwnerSelectionSessionListItem[],
  scopeType: 'gallery' | 'project' = 'gallery',
): OwnerSelectionDetail => ({
  sharelink_id: scopeType === 'project' ? 'link-project' : 'link-1',
  sharelink_label: scopeType === 'project' ? 'Project delivery' : 'Client proofing',
  scope_type: scopeType,
  project_name: scopeType === 'project' ? 'Wedding Weekend' : null,
  gallery_name: scopeType === 'gallery' ? 'Spring Session' : null,
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
    total_sessions: sessions.length,
    submitted_sessions: sessions.filter((session) => session.status === 'submitted').length,
    in_progress_sessions: sessions.filter((session) => session.status === 'in_progress').length,
    closed_sessions: sessions.filter((session) => session.status === 'closed').length,
    selected_count: sessions.reduce((sum, session) => sum + session.selected_count, 0),
    latest_activity_at: sessions[0]?.updated_at ?? null,
  },
  sessions,
  session: null,
});

const makeAnalytics = ({
  shareLink = {},
  selectionSummary = {},
  points,
}: {
  shareLink?: Partial<ShareLinkAnalyticsItem>;
  selectionSummary?: Partial<ShareLinkSelectionSummary>;
  points?: ShareLinkAnalyticsResponse['points'];
} = {}): ShareLinkAnalyticsResponse => ({
  share_link: {
    id: 'link-1',
    scope_type: 'gallery',
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
    ...shareLink,
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
    ...selectionSummary,
  },
  points: points ?? [
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
});

const defaultSession = makeSession('session-1', 'Ivan', { selected_count: 3 });

const renderPage = (shareLinkId = 'link-1') =>
  render(
    <MemoryRouter initialEntries={[`/share-links/${shareLinkId}`]}>
      <Routes>
        <Route path="/share-links/:shareLinkId" element={<ShareLinkDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

const openSelectionTab = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByRole('heading', { name: /client proofing|project delivery/i });
  await user.click(screen.getByRole('tab', { name: /photo selection/i }));
  await screen.findByText(/manage selection configuration and per-client selection sessions/i);
};

const getSessionOrder = () =>
  within(screen.getByRole('list', { name: /selection sessions/i }))
    .getAllByRole('button', { name: /open selection session for/i })
    .map((button) => button.getAttribute('aria-label')?.replace('Open selection session for ', ''));

describe('ShareLinkDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(copyTextToClipboard).mockResolvedValue(true);
    vi.mocked(shareLinkService.getShareLinkAnalytics).mockResolvedValue(makeAnalytics());
    vi.mocked(shareLinkService.getOwnerSelectionDetail).mockResolvedValue(
      makeSelectionDetail([defaultSession]),
    );
    vi.mocked(shareLinkService.getOwnerSelectionSessionDetail).mockImplementation(
      async (_shareLinkId, sessionId) =>
        makeSessionDetail(
          sessionId === defaultSession.id
            ? defaultSession
            : makeSession(sessionId, `Client ${sessionId}`),
        ),
    );
    vi.mocked(shareLinkService.updateShareLinkSelectionConfig).mockResolvedValue(
      makeSelectionDetail([defaultSession]).config,
    );
  });

  it('shows Overview first and lazy-loads selection only once', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: /client proofing/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /overview/i })).toHaveAttribute('aria-selected', 'true');
    expect(shareLinkService.getOwnerSelectionDetail).not.toHaveBeenCalled();
    expect(screen.getByText(/recent daily activity/i)).toBeInTheDocument();

    await openSelectionTab(user);
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

  it.each([
    {
      name: 'expired link',
      analytics: makeAnalytics({
        shareLink: { expires_at: '2020-01-01T00:00:00Z', is_active: false },
      }),
      label: 'Edit expiration',
    },
    {
      name: 'inactive link',
      analytics: makeAnalytics({
        shareLink: { is_active: false },
      }),
      label: 'Edit link',
    },
  ])('opens the existing editor from the CTA for an $name', async ({ analytics, label }) => {
    const user = userEvent.setup();
    vi.mocked(shareLinkService.getShareLinkAnalytics).mockResolvedValueOnce(analytics);
    renderPage();

    const nextAction = (await screen.findByText('Next best action')).parentElement;
    expect(nextAction).not.toBeNull();
    expect(within(nextAction!).getAllByRole('button')).toHaveLength(1);
    await user.click(within(nextAction!).getByRole('button', { name: label }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(shareLinkService.updateShareLink).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'in-progress sessions',
      summary: { in_progress_sessions: 2, submitted_sessions: 1 },
      label: 'Review selections',
    },
    {
      name: 'submitted sessions',
      summary: { in_progress_sessions: 0, submitted_sessions: 1 },
      label: 'Review exports',
    },
  ])('opens Photo selection from the CTA for $name', async ({ summary, label }) => {
    const user = userEvent.setup();
    vi.mocked(shareLinkService.getShareLinkAnalytics).mockResolvedValueOnce(
      makeAnalytics({ selectionSummary: summary }),
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: label }));

    expect(
      await screen.findByText(/manage selection configuration and per-client selection sessions/i),
    ).toBeInTheDocument();
    expect(shareLinkService.getOwnerSelectionDetail).toHaveBeenCalledTimes(1);
  });

  it('opens loaded analytics from the CTA without another request', async () => {
    const user = userEvent.setup();
    vi.mocked(shareLinkService.getShareLinkAnalytics).mockResolvedValueOnce(
      makeAnalytics({
        selectionSummary: { in_progress_sessions: 0, submitted_sessions: 0 },
      }),
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Open analytics' }));

    expect(await screen.findByText(/daily analytics breakdown/i)).toBeInTheDocument();
    expect(shareLinkService.getShareLinkAnalytics).toHaveBeenCalledTimes(1);
  });

  it('copies the client URL from the CTA when there is no activity', async () => {
    const user = userEvent.setup();
    vi.mocked(shareLinkService.getShareLinkAnalytics).mockResolvedValueOnce(
      makeAnalytics({
        selectionSummary: { in_progress_sessions: 0, submitted_sessions: 0 },
        points: [],
      }),
    );
    renderPage();

    const nextAction = (await screen.findByText('Next best action')).parentElement;
    await user.click(within(nextAction!).getByRole('button', { name: 'Copy client link' }));

    expect(copyTextToClipboard).toHaveBeenCalledWith(`${window.location.origin}/share/link-1`);
  });

  it('shows period controls only for analytics tabs and preserves the selected period', async () => {
    const user = userEvent.setup();
    renderPage();
    await openSelectionTab(user);
    expect(screen.queryByRole('group', { name: /analytics period/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /overview/i }));
    await user.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await waitFor(() => {
      expect(shareLinkService.getShareLinkAnalytics).toHaveBeenCalledWith('link-1', 7);
    });
    expect(screen.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('tab', { name: /daily analytics/i }));
    expect(screen.getByRole('group', { name: /analytics period/i })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /photo selection/i }));
    expect(screen.queryByRole('group', { name: /analytics period/i })).not.toBeInTheDocument();
    expect(shareLinkService.getOwnerSelectionDetail).toHaveBeenCalledTimes(1);
  });

  it('filters by search and status, loads the selected detail, and preserves comments', async () => {
    const user = userEvent.setup();
    const sessions = [
      makeSession('session-anna', 'Anna', {
        status: 'submitted',
        client_email: 'anna@example.com',
        client_note: 'Album shortlist',
      }),
      makeSession('session-boris', 'Boris', { status: 'closed' }),
      makeSession('session-claire', 'Claire', { status: 'in_progress' }),
    ];
    vi.mocked(shareLinkService.getOwnerSelectionDetail).mockResolvedValueOnce(
      makeSelectionDetail(sessions),
    );
    vi.mocked(shareLinkService.getOwnerSelectionSessionDetail).mockImplementation(
      async (_shareLinkId, sessionId) => {
        const session = sessions.find((candidate) => candidate.id === sessionId)!;
        return makeSessionDetail(session, [
          {
            photo_id: `${sessionId}-photo`,
            photo_display_name: `${session.client_name}.jpg`,
            comment: sessionId === 'session-anna' ? 'Warm the skin tone' : null,
            selected_at: '2026-04-12T09:10:00Z',
            updated_at: '2026-04-12T09:10:00Z',
          },
        ]);
      },
    );
    renderPage();
    await openSelectionTab(user);

    await user.type(screen.getByPlaceholderText(/search client/i), 'anna@example.com');
    await user.selectOptions(
      screen.getByRole('combobox', { name: /filter sessions by status/i }),
      'submitted',
    );

    expect(getSessionOrder()).toEqual(['Anna']);
    await waitFor(() => {
      expect(shareLinkService.getOwnerSelectionSessionDetail).toHaveBeenCalledWith(
        'link-1',
        'session-anna',
      );
    });
    expect(await screen.findByText('Warm the skin tone')).toBeInTheDocument();
    expect(screen.getAllByText('Album shortlist')).toHaveLength(2);
  });

  it('supports all session sort modes and preserves the active session after sorting', async () => {
    const user = userEvent.setup();
    const sessions = [
      makeSession('session-zoe', 'Zoe', {
        selected_count: 5,
        created_at: '2026-04-01T10:00:00Z',
        updated_at: '2026-04-10T10:00:00Z',
      }),
      makeSession('session-anna', 'Anna', {
        selected_count: 2,
        created_at: '2026-04-02T10:00:00Z',
        updated_at: '2026-04-12T10:00:00Z',
      }),
      makeSession('session-bob', 'bob', {
        selected_count: 5,
        created_at: '2026-04-03T10:00:00Z',
        updated_at: '2026-04-12T10:00:00Z',
      }),
    ];
    vi.mocked(shareLinkService.getOwnerSelectionDetail).mockResolvedValueOnce(
      makeSelectionDetail(sessions),
    );
    renderPage();
    await openSelectionTab(user);

    const sort = screen.getByRole('combobox', { name: /sort selection sessions/i });
    expect(sort).toHaveValue('recent');
    expect(getSessionOrder()).toEqual(['bob', 'Anna', 'Zoe']);

    await user.selectOptions(sort, 'oldest');
    expect(getSessionOrder()).toEqual(['Zoe', 'Anna', 'bob']);

    await user.selectOptions(sort, 'client_name');
    expect(getSessionOrder()).toEqual(['Anna', 'bob', 'Zoe']);

    await user.click(screen.getByRole('button', { name: /open selection session for anna/i }));
    await user.selectOptions(sort, 'selected_count');
    expect(getSessionOrder()).toEqual(['bob', 'Zoe', 'Anna']);
    expect(
      screen.getByRole('button', { name: /open selection session for anna/i }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects the first visible session after filtering, clears detail when empty, and restores current-order selection', async () => {
    const user = userEvent.setup();
    const sessions = [
      makeSession('session-anna', 'Anna', {
        updated_at: '2026-04-12T10:00:00Z',
      }),
      makeSession('session-boris', 'Boris', {
        updated_at: '2026-04-11T10:00:00Z',
      }),
    ];
    vi.mocked(shareLinkService.getOwnerSelectionDetail).mockResolvedValueOnce(
      makeSelectionDetail(sessions),
    );
    renderPage();
    await openSelectionTab(user);

    await user.click(screen.getByRole('button', { name: /open selection session for boris/i }));
    await user.clear(screen.getByPlaceholderText(/search client/i));
    await user.type(screen.getByPlaceholderText(/search client/i), 'Anna');
    expect(
      screen.getByRole('button', { name: /open selection session for anna/i }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.clear(screen.getByPlaceholderText(/search client/i));
    await user.type(screen.getByPlaceholderText(/search client/i), 'Nobody');
    expect(await screen.findByText(/no sessions match your filters/i)).toBeInTheDocument();
    expect(screen.getByText(/select a session to inspect chosen photos/i)).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(/search client/i));
    expect(
      screen.getByRole('button', { name: /open selection session for anna/i }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores a stale session-detail response after filters clear the selection', async () => {
    const user = userEvent.setup();
    const session = makeSession('session-delayed', 'Delayed client');
    let resolveDetail!: (detail: SelectionSession) => void;
    vi.mocked(shareLinkService.getOwnerSelectionDetail).mockResolvedValueOnce(
      makeSelectionDetail([session]),
    );
    vi.mocked(shareLinkService.getOwnerSelectionSessionDetail).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDetail = resolve;
      }),
    );
    renderPage();
    await openSelectionTab(user);
    await waitFor(() => {
      expect(shareLinkService.getOwnerSelectionSessionDetail).toHaveBeenCalledWith(
        'link-1',
        'session-delayed',
      );
    });

    await user.type(screen.getByPlaceholderText(/search client/i), 'Nobody');
    resolveDetail(makeSessionDetail(session));

    expect(await screen.findByText(/no sessions match your filters/i)).toBeInTheDocument();
    expect(screen.getByText(/select a session to inspect chosen photos/i)).toBeInTheDocument();
  });

  it('keeps close, reopen, CSV, and Lightroom actions wired to the existing services', async () => {
    const user = userEvent.setup();
    const sessions = [
      makeSession('session-open', 'Open client'),
      makeSession('session-closed', 'Closed client', { status: 'closed' }),
    ];
    vi.mocked(shareLinkService.getOwnerSelectionDetail).mockResolvedValue(
      makeSelectionDetail(sessions),
    );
    renderPage();
    await openSelectionTab(user);

    await user.click(screen.getByRole('button', { name: 'CSV' }));
    await user.click(screen.getByRole('button', { name: 'Lightroom' }));
    const sessionList = screen.getByRole('list', { name: /selection sessions/i });
    await user.click(within(sessionList).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(shareLinkService.closeOwnerSelectionSession).toHaveBeenCalledWith(
        'link-1',
        'session-open',
      );
    });
    await user.click(within(sessionList).getByRole('button', { name: 'Reopen' }));

    expect(shareLinkService.exportShareLinkSelectionFilesCsv).toHaveBeenCalledWith('link-1');
    expect(shareLinkService.exportShareLinkSelectionLightroom).toHaveBeenCalledWith('link-1');
    expect(shareLinkService.reopenOwnerSelectionSession).toHaveBeenCalledWith(
      'link-1',
      'session-closed',
    );
  });

  it('preserves gallery grouping for project selection details', async () => {
    const projectSession = makeSession('project-session-1', 'Anna', {
      status: 'submitted',
      selected_count: 2,
    });
    vi.mocked(shareLinkService.getShareLinkAnalytics).mockResolvedValueOnce(
      makeAnalytics({
        shareLink: {
          id: 'link-project',
          scope_type: 'project',
          gallery_id: null,
          project_id: 'project-1',
          project_name: 'Wedding Weekend',
          label: 'Project delivery',
        },
        selectionSummary: {
          status: 'submitted',
          total_sessions: 1,
          submitted_sessions: 1,
          in_progress_sessions: 0,
          selected_count: 2,
        },
      }),
    );
    vi.mocked(shareLinkService.getOwnerSelectionDetail).mockResolvedValueOnce(
      makeSelectionDetail([projectSession], 'project'),
    );
    vi.mocked(shareLinkService.getOwnerSelectionSessionDetail).mockResolvedValueOnce(
      makeSessionDetail(projectSession, [
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
      ]),
    );

    const user = userEvent.setup();
    renderPage('link-project');
    await openSelectionTab(user);

    expect(await screen.findByText('Ceremony')).toBeInTheDocument();
    expect(screen.getByText('Portraits')).toBeInTheDocument();
    expect(screen.getByText('Retouch')).toBeInTheDocument();
  });
});
