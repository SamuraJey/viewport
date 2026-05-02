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
    updateShareLink: vi.fn(),
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
            total_sessions: 1,
            submitted_sessions: 0,
            in_progress_sessions: 1,
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
    expect(screen.getByRole('heading', { name: /selection tools/i })).toBeInTheDocument();
    expect(screen.getAllByText('Preview for Ivan').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Untitled share link').length).toBeGreaterThan(0);
    expect(screen.getByText(/selection progress/i)).toBeInTheDocument();
    expect(screen.getAllByText(/submitted/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /details/i })).toHaveLength(2);
  });

  it('keeps bulk selection actions outside the main list and calls them', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText('Preview for Ivan');
    await user.click(
      screen.getByRole('button', { name: /close selection intake for page galleries/i }),
    );
    await user.click(
      screen.getByRole('button', { name: /open selection intake for page galleries/i }),
    );

    expect(shareLinkService.closeAllGallerySelections).toHaveBeenCalled();
    expect(shareLinkService.openAllGallerySelections).toHaveBeenCalled();
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
