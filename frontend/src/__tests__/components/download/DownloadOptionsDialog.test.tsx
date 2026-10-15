import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { DownloadOptionsDialog } from '../../../components/download/DownloadOptionsDialog';
import type { DownloadEstimate } from '../../../types/download';

const ready: DownloadEstimate = {
  image_count: 2, video_count: 1, available_video_count: 1,
  original_size_bytes: 30_000_000, publication_size_bytes: 20_700_000,
  publication_pending_count: 0,
};
const withoutVideos: DownloadEstimate = {
  ...ready, video_count: 0, original_size_bytes: 10_000_000, publication_size_bytes: 700_000,
};
const deferred = () => {
  let resolve!: (value: DownloadEstimate) => void;
  const promise = new Promise<DownloadEstimate>((done) => { resolve = done; });
  return { promise, resolve };
};
const props = (overrides: Partial<ComponentProps<typeof DownloadOptionsDialog>> = {}) => ({
  open: true, title: 'Download files', isArchive: true, onClose: vi.fn(),
  loadEstimate: vi.fn().mockResolvedValue(ready), onDownload: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});
const loaded = async () => {
  await waitFor(() => expect(screen.queryByRole('status', { name: 'Loading download estimate' })).not.toBeInTheDocument());
};

describe('DownloadOptionsDialog', () => {
  it('defaults to full size, estimates each quality, and submits the chosen composition', async () => {
    const user = userEvent.setup();
    const input = props();
    render(<DownloadOptionsDialog {...input} />);
    await loaded();
    expect(screen.getByRole('radio', { name: /Full size/ })).toBeChecked();
    expect(screen.getAllByText(/Approx\./)).toHaveLength(2);
    await user.click(screen.getByRole('radio', { name: /For publishing/ }));
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(input.onDownload).toHaveBeenCalledWith({ quality: 'publication', includeVideos: true });
    await waitFor(() => expect(input.onClose).toHaveBeenCalledTimes(1));
  });

  it('blocks confirmation while checkbox estimates load and ignores an older response', async () => {
    const user = userEvent.setup();
    const older = deferred();
    const newer = deferred();
    const load = vi.fn().mockResolvedValueOnce(ready).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    render(<DownloadOptionsDialog {...props({ loadEstimate: load })} />);
    await loaded();
    await user.click(screen.getByRole('checkbox', { name: /Include videos/ }));
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /Include videos/ }));
    await act(async () => { newer.resolve(ready); });
    await loaded();
    await act(async () => { older.resolve(withoutVideos); });
    expect(screen.getByText('2 photos · 1 video')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
  });

  it('ignores closed and old-scope requests and resets preferences on reopening', async () => {
    const user = userEvent.setup();
    const first = deferred();
    const input = props({ loadEstimate: vi.fn().mockReturnValue(first.promise) });
    const { rerender } = render(<DownloadOptionsDialog {...input} />);
    rerender(<DownloadOptionsDialog {...input} open={false} />);
    const current = props({ loadEstimate: vi.fn().mockResolvedValue(withoutVideos) });
    rerender(<DownloadOptionsDialog {...current} />);
    await loaded();
    await user.click(screen.getByRole('radio', { name: /For publishing/ }));
    await act(async () => { first.resolve(ready); });
    expect(screen.getByText('2 photos · 0 videos')).toBeInTheDocument();
    rerender(<DownloadOptionsDialog {...current} open={false} />);
    rerender(<DownloadOptionsDialog {...current} />);
    await loaded();
    expect(screen.getByRole('radio', { name: /Full size/ })).toBeChecked();
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('makes missing publication files honestly unavailable while retaining full size', async () => {
    render(<DownloadOptionsDialog {...props({ loadEstimate: vi.fn().mockResolvedValue({
      ...ready, publication_pending_count: 2, publication_size_bytes: null,
    }) })} />);
    await loaded();
    expect(screen.getByRole('radio', { name: /For publishing/ })).toBeDisabled();
    expect(screen.getByText(/2 photos unavailable for publishing/)).toHaveTextContent('Full-size files remain available.');
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
  });

  it('downloads video-only archives as originals and handles empty video exclusion', async () => {
    const user = userEvent.setup();
    const input = props({ loadEstimate: vi.fn().mockResolvedValueOnce({ ...ready, image_count: 0 })
      .mockResolvedValueOnce({ ...ready, image_count: 0, video_count: 0, original_size_bytes: 0, publication_size_bytes: 0 }) });
    render(<DownloadOptionsDialog {...input} />);
    await loaded();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox'));
    await loaded();
    expect(screen.getByText('No downloadable files')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();
  });

  it('offers explicit estimate retry and keeps a rejected download open for another confirmation', async () => {
    const user = userEvent.setup();
    const download = vi.fn().mockRejectedValueOnce(new Error('Download unavailable')).mockResolvedValueOnce(undefined);
    const input = props({ onDownload: download, loadEstimate: vi.fn().mockRejectedValueOnce(new Error('Estimate unavailable')).mockResolvedValueOnce(ready) });
    render(<DownloadOptionsDialog {...input} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Estimate unavailable');
    await user.click(screen.getByRole('button', { name: 'Retry estimate' }));
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Download unavailable');
    expect(input.onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(input.onClose).toHaveBeenCalledTimes(1));
  });

  it('labels demo limitations and omits video controls on a single-photo download', async () => {
    render(<DownloadOptionsDialog {...props({ isArchive: false, isDemo: true })} />);
    await loaded();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/Approx\./)).not.toBeInTheDocument();
    expect(screen.getByText(/Demo: sizes and archive downloads are simulated/)).toHaveTextContent('Sample photo downloads do not demonstrate the publishing JPEG profile.');
  });
});
