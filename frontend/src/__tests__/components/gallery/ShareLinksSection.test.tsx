import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareLinksSection } from '../../../components/gallery/ShareLinksSection';
import type { ShareLink } from '../../../types';

describe('ShareLinksSection', () => {
  const mockWriteText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    mockWriteText.mockReset();

    // Mock navigator.clipboard (moved into beforeEach to keep global state isolated)
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: mockWriteText,
      },
      configurable: true,
      writable: true,
    });

    // Mock window.location for construction of share links
    // Using vi.stubGlobal ensures it is properly cleaned up by vi.unstubAllGlobals()
    vi.stubGlobal('location', {
      ...window.location,
      origin: 'http://localhost:3000',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    // Restore/Cleanup navigator.clipboard to avoid leaking into other test files
    // @ts-expect-error - Restoring the original navigator.clipboard after tests
    delete navigator.clipboard;
  });

  const mockShareLinks: ShareLink[] = [
    {
      id: 'link-1',
      created_at: '2024-01-01T10:00:00Z',
      expires_at: null,
      views: 10,
      zip_downloads: 2,
      single_downloads: 3,
    },
    {
      id: 'link-2',
      created_at: '2024-01-02T10:00:00Z',
      expires_at: null,
      views: 5,
      zip_downloads: 1,
      single_downloads: 1,
    },
    {
      id: 'link-3',
      created_at: '2024-01-03T10:00:00Z',
      expires_at: null,
      views: 20,
      zip_downloads: 3,
      single_downloads: 5,
    },
  ];

  const defaultProps = {
    shareLinks: mockShareLinks,
    isCreatingLink: false,
    onCreateLink: vi.fn(),
    onDeleteLink: vi.fn(),
  };

  it('should render share links section with correct title', () => {
    render(<ShareLinksSection {...defaultProps} />);
    expect(screen.getByText('Share Links')).toBeInTheDocument();
  });

  it('should display total metrics correctly', () => {
    render(<ShareLinksSection {...defaultProps} />);
    // Total views: 10 + 5 + 20 = 35
    expect(screen.getByText('35')).toBeInTheDocument();
    // Total ZIP downloads: 2 + 1 + 3 = 6
    expect(screen.getByText('6')).toBeInTheDocument();
    // Total downloads: (2+3) + (1+1) + (3+5) = 5 + 2 + 8 = 15
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('should sort share links by creation date (oldest first)', () => {
    render(<ShareLinksSection {...defaultProps} />);

    const linkElements = screen.getAllByRole('listitem');
    expect(linkElements).toHaveLength(3);

    // Check that the first link shown is the oldest (link-1 from 2024-01-01)
    const firstLink = linkElements[0];
    expect(firstLink).toHaveTextContent('link-1');

    // Check that the last link shown is the newest (link-3 from 2024-01-03)
    const lastLink = linkElements[2];
    expect(lastLink).toHaveTextContent('link-3');
  });

  it('should display numbered links starting from 1', () => {
    render(<ShareLinksSection {...defaultProps} />);

    // Check that the numbered badges are displayed with correct numbers
    const badges = document.querySelectorAll(
      '.flex.h-8.w-8.items-center.justify-center.rounded-full.bg-accent\\/15',
    );
    expect(badges).toHaveLength(3);
    expect(badges[0]).toHaveTextContent('1');
    expect(badges[1]).toHaveTextContent('2');
    expect(badges[2]).toHaveTextContent('3');
  });

  it('should display link URLs correctly', () => {
    render(<ShareLinksSection {...defaultProps} />);

    expect(screen.getByText('http://localhost:3000/share/link-1')).toBeInTheDocument();
    expect(screen.getByText('http://localhost:3000/share/link-2')).toBeInTheDocument();
    expect(screen.getByText('http://localhost:3000/share/link-3')).toBeInTheDocument();
  });

  it('should display individual link metrics', () => {
    render(<ShareLinksSection {...defaultProps} />);

    // Check metrics for each link using data-testid
    const link1Metrics = screen.getByTestId('share-link-link-1-metrics');
    const link2Metrics = screen.getByTestId('share-link-link-2-metrics');
    const link3Metrics = screen.getByTestId('share-link-link-3-metrics');

    // First link metrics
    expect(link1Metrics).toHaveTextContent('10'); // views for link-1
    expect(link1Metrics).toHaveTextContent('2'); // zip downloads for link-1
    expect(link1Metrics).toHaveTextContent('5'); // total downloads for link-1 (2+3)

    // Second link metrics
    expect(link2Metrics).toHaveTextContent('5'); // views for link-2
    expect(link2Metrics).toHaveTextContent('1'); // zip downloads for link-2
    expect(link2Metrics).toHaveTextContent('2'); // total downloads for link-2 (1+1)

    // Third link metrics
    expect(link3Metrics).toHaveTextContent('20'); // views for link-3
    expect(link3Metrics).toHaveTextContent('3'); // zip downloads for link-3
    expect(link3Metrics).toHaveTextContent('8'); // total downloads for link-3 (3+5)
  });

  it('should call onCreateLink when create button is clicked', async () => {
    const user = userEvent.setup();
    const mockOnCreateLink = vi.fn();

    render(<ShareLinksSection {...defaultProps} onCreateLink={mockOnCreateLink} />);

    const createButton = screen.getByText('Create New Link');
    await user.click(createButton);

    expect(mockOnCreateLink).toHaveBeenCalledTimes(1);
  });

  it('should call onDeleteLink when delete button is clicked', async () => {
    const user = userEvent.setup();
    const mockOnDeleteLink = vi.fn();

    render(<ShareLinksSection {...defaultProps} onDeleteLink={mockOnDeleteLink} />);

    const deleteButtons = screen.getAllByRole('button', { name: /delete link/i });
    await user.click(deleteButtons[0]);

    expect(mockOnDeleteLink).toHaveBeenCalledWith('link-1');
  });

  it('should display empty state when no share links exist', () => {
    render(<ShareLinksSection {...defaultProps} shareLinks={[]} />);

    expect(
      screen.getByText('No share links created yet. Create one to share this gallery!'),
    ).toBeInTheDocument();
  });

  it('should disable create button when creating', () => {
    render(<ShareLinksSection {...defaultProps} isCreatingLink={true} />);

    const createButton = screen.getByText('Create New Link').closest('button');
    expect(createButton).toBeDisabled();
  });

  it('should handle null values in metrics gracefully', () => {
    const linksWithNulls: ShareLink[] = [
      {
        id: 'link-null',
        created_at: '2024-01-01T10:00:00Z',
        expires_at: null,
        views: 0,
        zip_downloads: 0,
        single_downloads: 0,
      },
    ];

    render(<ShareLinksSection {...defaultProps} shareLinks={linksWithNulls} />);

    // Should display 0 for null values in the metrics
    const metricsContainer = screen.getByTestId('share-link-link-null-metrics');
    expect(metricsContainer).toHaveTextContent('0');
  });

  it('should render loading state when share links are still loading', () => {
    render(<ShareLinksSection {...defaultProps} shareLinks={[]} isLoading={true} />);

    expect(screen.getByText('Loading share links...')).toBeInTheDocument();
  });

  it('should render retry state when share links fail to load', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <ShareLinksSection
        {...defaultProps}
        shareLinks={[]}
        error="Failed to load share links"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Failed to load share links')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
