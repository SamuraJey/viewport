import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareLinksDashboardPage } from '../../pages/ShareLinksDashboardPage';
import { shareLinkService } from '../../services/shareLinkService';

const mockSetTotal = vi.fn();
const mockGoToPage = vi.fn();

vi.mock('../../services/shareLinkService', () => ({
  shareLinkService: {
    getOwnerShareLinks: vi.fn(),
    getGallerySelections: vi.fn(),
    deleteShareLink: vi.fn(),
    deleteProjectShareLink: vi.fn(),
    updateShareLink: vi.fn(),
    updateProjectShareLink: vi.fn(),
    closeOwnerSelection: vi.fn(),
    reopenOwnerSelection: vi.fn(),
    closeAllShareLinkSelections: vi.fn(),
    openAllShareLinkSelections: vi.fn(),
    closeAllGallerySelections: vi.fn(),
    openAllGallerySelections: vi.fn(),
    exportGallerySelectionSummaryCsv: vi.fn(),
    exportGallerySelectionLinksCsv: vi.fn(),
  },
}));

vi.mock('../../hooks', () => ({
  usePagination: () => ({
    page: 1,
    pageSize: 20,
    total: 0,
    setTotal: mockSetTotal,
    goToPage: mockGoToPage,
  }),
  useConfirmation: () => ({
    openConfirm: ({ onConfirm }: { onConfirm: () => Promise<void> }) => {
      void onConfirm();
    },
    ConfirmModal: null,
  }),
}));

vi.mock('../../components/PaginationControls', () => ({
  PaginationControls: () => <div data-testid="pagination-controls" />,
}));

describe('ShareLinksDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(shareLinkService.getOwnerShareLinks).mockResolvedValue({
      share_links: [
        {
          id: 'link-1',
          gallery_id: 'gallery-1',
          gallery_name: 'Wedding',
          cover_photo_thumbnail_url: 'https://example.com/thumb-wedding.jpg',
          label: 'Preview for Ivan',
          is_active: true,
          expires_at: null,
          views: 12,
          zip_downloads: 2,
          single_downloads: 3,
          created_at: '2026-04-10T10:00:00Z',
          updated_at: '2026-04-12T10:00:00Z',
          selection_summary: {
            is_enabled: true,
            status: 'in_progress',
            total_sessions: 2,
            submitted_sessions: 0,
            in_progress_sessions: 2,
            closed_sessions: 0,
            selected_count: 4,
            latest_activity_at: '2026-04-12T10:00:00Z',
          },
        },
        {
          id: 'link-2',
          gallery_id: 'gallery-2',
          gallery_name: 'Portraits',
          label: null,
          is_active: false,
          expires_at: '2026-04-30T10:00:00Z',
          views: 3,
          zip_downloads: 1,
          single_downloads: 0,
          created_at: '2026-04-11T10:00:00Z',
          updated_at: '2026-04-13T10:00:00Z',
          selection_summary: {
            is_enabled: false,
            status: 'not_started',
            total_sessions: 0,
            submitted_sessions: 0,
            in_progress_sessions: 0,
            closed_sessions: 0,
            selected_count: 0,
            latest_activity_at: null,
          },
        },
      ],
      total: 2,
      page: 1,
      size: 20,
      summary: {
        views: 15,
        zip_downloads: 3,
        single_downloads: 3,
        active_links: 1,
      },
    } as any);
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <ShareLinksDashboardPage />
      </MemoryRouter>,
    );

  it('renders dashboard overview and clearer link cards', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { name: /share links dashboard/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/monitor performance, manage share links/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /selection scope/i })).toBeInTheDocument();
    expect(screen.getAllByText('Preview for Ivan').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Untitled share link').length).toBeGreaterThan(0);
    expect(screen.getByText(/selection progress/i)).toBeInTheDocument();
    expect(screen.getAllByText(/submitted/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /details/i })).toHaveLength(2);
    expect(screen.getByText(/sorted by most recent activity/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /delete link/i })).toHaveLength(2);
  });

  it('renders date-only analytics labels as local calendar days', async () => {
    vi.mocked(shareLinkService.getOwnerShareLinks).mockResolvedValue({
      share_links: [],
      total: 0,
      page: 1,
      size: 20,
      summary: {
        views: 3,
        zip_downloads: 0,
        single_downloads: 0,
        active_links: 0,
      },
      points: [
        {
          day: '2026-01-01',
          views_total: 1,
          views_unique: 1,
          zip_downloads: 0,
          single_downloads: 0,
        },
        {
          day: '2026-01-02',
          views_total: 0,
          views_unique: 0,
          zip_downloads: 0,
          single_downloads: 0,
        },
        {
          day: '2026-01-03',
          views_total: 1,
          views_unique: 1,
          zip_downloads: 0,
          single_downloads: 0,
        },
        {
          day: '2026-01-04',
          views_total: 0,
          views_unique: 0,
          zip_downloads: 0,
          single_downloads: 0,
        },
        {
          day: '2026-01-05',
          views_total: 1,
          views_unique: 1,
          zip_downloads: 0,
          single_downloads: 0,
        },
      ],
    } as any);

    renderPage();

    expect(await screen.findByText('Jan 1')).toBeInTheDocument();
    expect(screen.getByText('Jan 5')).toBeInTheDocument();
  });

  it('runs bulk selection actions only for checked share links', async () => {
    const user = userEvent.setup();
    vi.mocked(shareLinkService.getOwnerShareLinks).mockResolvedValue({
      share_links: [
        {
          id: 'gallery-link-1',
          scope_type: 'gallery',
          gallery_id: 'gallery-1',
          gallery_name: 'Wedding',
          label: 'Gallery intake',
          is_active: true,
          expires_at: null,
          views: 12,
          zip_downloads: 2,
          single_downloads: 3,
          created_at: '2026-04-10T10:00:00Z',
          updated_at: '2026-04-12T10:00:00Z',
          selection_summary: {
            is_enabled: true,
            status: 'in_progress',
            total_sessions: 3,
            submitted_sessions: 0,
            in_progress_sessions: 2,
            closed_sessions: 1,
            selected_count: 4,
            latest_activity_at: '2026-04-12T10:00:00Z',
          },
        },
        {
          id: 'project-link-1',
          scope_type: 'project',
          project_id: 'project-1',
          project_name: 'Wedding Project',
          label: 'Project intake',
          is_active: true,
          expires_at: null,
          views: 5,
          zip_downloads: 0,
          single_downloads: 0,
          created_at: '2026-04-11T10:00:00Z',
          updated_at: '2026-04-13T10:00:00Z',
          selection_summary: {
            is_enabled: true,
            status: 'in_progress',
            total_sessions: 3,
            submitted_sessions: 0,
            in_progress_sessions: 2,
            closed_sessions: 1,
            selected_count: 8,
            latest_activity_at: '2026-04-13T10:00:00Z',
          },
        },
        {
          id: 'closed-project-link',
          scope_type: 'project',
          project_id: 'project-2',
          project_name: 'Closed Project',
          label: 'Closed project intake',
          is_active: true,
          expires_at: null,
          views: 1,
          zip_downloads: 0,
          single_downloads: 0,
          created_at: '2026-04-09T10:00:00Z',
          updated_at: '2026-04-09T10:00:00Z',
          selection_summary: {
            is_enabled: true,
            status: 'closed',
            total_sessions: 2,
            submitted_sessions: 0,
            in_progress_sessions: 0,
            closed_sessions: 2,
            selected_count: 2,
            latest_activity_at: '2026-04-09T10:00:00Z',
          },
        },
      ],
      total: 3,
      page: 1,
      size: 20,
      summary: {
        views: 18,
        zip_downloads: 2,
        single_downloads: 3,
        active_links: 3,
      },
    } as any);
    vi.mocked(shareLinkService.closeAllShareLinkSelections)
      .mockResolvedValueOnce({ affected_count: 2 })
      .mockResolvedValueOnce({ affected_count: 2 });
    vi.mocked(shareLinkService.openAllShareLinkSelections)
      .mockResolvedValueOnce({ affected_count: 1 })
      .mockResolvedValueOnce({ affected_count: 1 })
      .mockResolvedValueOnce({ affected_count: 2 });

    renderPage();

    await screen.findAllByText('Project intake');
    await user.click(screen.getByRole('checkbox', { name: /select share link gallery intake/i }));
    await user.click(screen.getByRole('checkbox', { name: /select share link project intake/i }));

    await user.click(
      screen.getByRole('button', {
        name: /close selection intake for 4 selected active sessions/i,
      }),
    );
    await waitFor(() => {
      expect(shareLinkService.closeAllShareLinkSelections).toHaveBeenCalledWith('project-link-1');
    });
    await user.click(
      screen.getByRole('button', {
        name: /reopen selection intake for 2 selected closed sessions/i,
      }),
    );

    expect(shareLinkService.closeAllShareLinkSelections).toHaveBeenCalledWith('gallery-link-1');
    expect(shareLinkService.closeAllShareLinkSelections).toHaveBeenCalledWith('project-link-1');
    expect(shareLinkService.closeOwnerSelection).not.toHaveBeenCalled();
    expect(shareLinkService.closeAllGallerySelections).not.toHaveBeenCalled();
    expect(shareLinkService.openAllShareLinkSelections).toHaveBeenCalledWith('gallery-link-1');
    expect(shareLinkService.openAllShareLinkSelections).toHaveBeenCalledWith('project-link-1');
    expect(shareLinkService.openAllShareLinkSelections).not.toHaveBeenCalledWith(
      'closed-project-link',
    );
    expect(shareLinkService.reopenOwnerSelection).not.toHaveBeenCalled();
    expect(shareLinkService.openAllGallerySelections).not.toHaveBeenCalled();
  });

  it('renders search and refresh controls for list navigation', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText('Preview for Ivan');

    expect(
      screen.getByPlaceholderText(/search by label, share link id, or gallery/i),
    ).toBeInTheDocument();

    const callsBeforeRefresh = vi.mocked(shareLinkService.getOwnerShareLinks).mock.calls.length;
    await user.click(screen.getByRole('button', { name: /refresh list/i }));

    expect(vi.mocked(shareLinkService.getOwnerShareLinks).mock.calls.length).toBeGreaterThan(
      callsBeforeRefresh,
    );
  });

  it('shows a refresh loading state for manual refresh', async () => {
    const user = userEvent.setup();
    let refreshResolve: ((value: any) => void) | undefined;

    vi.mocked(shareLinkService.getOwnerShareLinks).mockReset();
    vi.mocked(shareLinkService.getOwnerShareLinks).mockResolvedValueOnce({
      share_links: [
        {
          id: 'link-1',
          gallery_id: 'gallery-1',
          gallery_name: 'Wedding',
          cover_photo_thumbnail_url: 'https://example.com/thumb-wedding.jpg',
          label: 'Preview for Ivan',
          is_active: true,
          expires_at: null,
          views: 12,
          zip_downloads: 2,
          single_downloads: 3,
          created_at: '2026-04-10T10:00:00Z',
          updated_at: '2026-04-12T10:00:00Z',
          selection_summary: {
            is_enabled: true,
            status: 'in_progress',
            total_sessions: 1,
            submitted_sessions: 0,
            in_progress_sessions: 1,
            closed_sessions: 0,
            selected_count: 4,
            latest_activity_at: '2026-04-12T10:00:00Z',
          },
        },
      ],
      total: 1,
      page: 1,
      size: 20,
      summary: {
        views: 12,
        zip_downloads: 2,
        single_downloads: 3,
        active_links: 1,
      },
    } as any);
    vi.mocked(shareLinkService.getOwnerShareLinks).mockImplementationOnce(() => {
      return new Promise((resolve) => {
        refreshResolve = resolve;
      });
    });

    renderPage();
    await screen.findAllByText('Preview for Ivan');

    const refreshButton = screen.getByRole('button', { name: /refresh list/i });
    await user.click(refreshButton);

    expect(refreshButton).toBeDisabled();
    expect(screen.getByText('Refreshing…')).toBeInTheDocument();

    refreshResolve?.({
      share_links: [
        {
          id: 'link-3',
          gallery_id: 'gallery-3',
          gallery_name: 'Family',
          label: 'Refreshed',
          is_active: true,
          expires_at: null,
          views: 0,
          zip_downloads: 0,
          single_downloads: 0,
          created_at: '2026-04-14T10:00:00Z',
          updated_at: '2026-04-14T10:00:00Z',
          selection_summary: {
            is_enabled: false,
            status: 'not_started',
            total_sessions: 0,
            submitted_sessions: 0,
            in_progress_sessions: 0,
            closed_sessions: 0,
            selected_count: 0,
            latest_activity_at: null,
          },
        },
      ],
      total: 1,
      page: 1,
      size: 20,
      summary: {
        views: 0,
        zip_downloads: 0,
        single_downloads: 0,
        active_links: 1,
      },
    });

    expect((await screen.findAllByText('Refreshed')).length).toBeGreaterThan(0);
    expect(refreshButton).not.toBeDisabled();
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('requests backend-filtered results by status and resets pagination', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText('Preview for Ivan');
    await user.click(screen.getByRole('button', { name: /paused/i }));

    expect(mockGoToPage).toHaveBeenCalledWith(1);
    expect(shareLinkService.getOwnerShareLinks).toHaveBeenLastCalledWith(
      1,
      20,
      undefined,
      'inactive',
    );
  });

  it('updates summary hints when a backend status filter is active', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText('Preview for Ivan');
    await user.click(screen.getByRole('button', { name: /paused/i }));

    expect(await screen.findAllByText(/across filtered results/i)).toHaveLength(2);
  });

  it('keeps the latest dashboard response when older requests resolve later', async () => {
    let resolveFirst: ((value: any) => void) | undefined;
    let resolveSecond: ((value: any) => void) | undefined;

    vi.mocked(shareLinkService.getOwnerShareLinks)
      .mockImplementationOnce(
        () =>
          new Promise<any>((resolve: (value: any) => void) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<any>((resolve: (value: any) => void) => {
            resolveSecond = resolve;
          }),
      );

    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /refresh list/i }));

    resolveSecond?.({
      share_links: [
        {
          id: 'latest-link',
          gallery_id: 'gallery-9',
          gallery_name: 'Latest Gallery',
          label: 'Latest result',
          is_active: true,
          expires_at: null,
          views: 1,
          zip_downloads: 0,
          single_downloads: 0,
          created_at: '2026-04-20T10:00:00Z',
          updated_at: '2026-04-20T10:00:00Z',
          selection_summary: {
            is_enabled: false,
            status: 'not_started',
            total_sessions: 0,
            submitted_sessions: 0,
            in_progress_sessions: 0,
            closed_sessions: 0,
            selected_count: 0,
            latest_activity_at: null,
          },
        },
      ],
      total: 1,
      page: 1,
      size: 20,
      summary: {
        views: 1,
        zip_downloads: 0,
        single_downloads: 0,
        active_links: 1,
      },
    });

    await screen.findAllByText('Latest result');

    resolveFirst?.({
      share_links: [
        {
          id: 'stale-link',
          gallery_id: 'gallery-8',
          gallery_name: 'Stale Gallery',
          label: 'Stale result',
          is_active: true,
          expires_at: null,
          views: 5,
          zip_downloads: 0,
          single_downloads: 0,
          created_at: '2026-04-19T10:00:00Z',
          updated_at: '2026-04-19T10:00:00Z',
          selection_summary: {
            is_enabled: false,
            status: 'not_started',
            total_sessions: 0,
            submitted_sessions: 0,
            in_progress_sessions: 0,
            closed_sessions: 0,
            selected_count: 0,
            latest_activity_at: null,
          },
        },
      ],
      total: 1,
      page: 1,
      size: 20,
      summary: {
        views: 5,
        zip_downloads: 0,
        single_downloads: 0,
        active_links: 1,
      },
    });

    await waitFor(() => {
      expect(screen.getAllByText('Latest result').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('Stale result')).not.toBeInTheDocument();
  });
});
