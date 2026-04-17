import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
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
          label: 'Preview for Ivan',
          is_active: true,
          expires_at: null,
          views: 12,
          zip_downloads: 2,
          single_downloads: 3,
          created_at: '2026-04-10T10:00:00Z',
          updated_at: '2026-04-12T10:00:00Z',
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

    vi.mocked(shareLinkService.getGallerySelections).mockResolvedValue([
      {
        sharelink_id: 'link-1',
        status: 'in_progress',
        selected_count: 4,
      },
      {
        sharelink_id: 'link-2',
        status: 'submitted',
        selected_count: 1,
      },
    ] as any);
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
    expect(screen.getByText(/monitor status, jump to the right gallery/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /selection tools/i })).toBeInTheDocument();
    expect(screen.getByText('Preview for Ivan')).toBeInTheDocument();
    expect(screen.getByText('Untitled share link')).toBeInTheDocument();
    expect(screen.getByText(/selection progress/i)).toBeInTheDocument();
    expect(screen.getByText(/submitted sessions on this page/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /details/i })).toHaveLength(2);
  });

  it('keeps bulk selection actions outside the main list and calls them', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Preview for Ivan');
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

    await screen.findByText('Preview for Ivan');

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

    await screen.findByText('Preview for Ivan');
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

    await screen.findByText('Preview for Ivan');
    await user.click(screen.getByRole('button', { name: /paused/i }));

    expect(await screen.findAllByText(/across filtered results/i)).toHaveLength(2);
  });
});
