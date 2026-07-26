import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UploadQueueList } from '../../../components/upload/UploadQueueList';
import type { UploadJob } from '../../../components/upload/types';
import { createImageThumbnail } from '../../../lib/imageThumbnail';

vi.mock('../../../lib/imageThumbnail', () => ({
  createImageThumbnail: vi.fn().mockResolvedValue({
    url: null,
    cleanup: vi.fn(),
  }),
}));

const makeJob = (id: string, status: UploadJob['status'] = 'queued', progress = 0): UploadJob => ({
  id,
  file: new File(['image'], `${id}.jpg`, {
    type: 'image/jpeg',
    lastModified: id.charCodeAt(0),
  }),
  filename: `${id}.jpg`,
  status,
  progress,
  retryable: true,
  ...(status === 'failed' ? { error: 'Connection lost' } : {}),
});

describe('UploadQueueList', () => {
  it('supports keyboard reordering from the focused drag handle', async () => {
    const user = userEvent.setup();
    const jobs = [makeJob('first'), makeJob('second')];
    const onReorder = vi.fn();
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        const row = this.closest?.('[data-upload-job]') as HTMLElement | null;
        const top = row?.dataset.uploadJob === 'second' ? 60 : 0;
        return {
          x: 0,
          y: top,
          top,
          left: 0,
          right: 240,
          bottom: top + 48,
          width: 240,
          height: 48,
          toJSON: () => ({}),
        } as DOMRect;
      });

    try {
      render(
        <UploadQueueList jobs={jobs} onReorder={onReorder} onRetry={vi.fn()} onRemove={vi.fn()} />,
      );

      const handle = screen.getByRole('button', { name: /reorder first\.jpg/i });
      handle.focus();
      await user.keyboard('[Space][ArrowDown][Space]');

      expect(onReorder).toHaveBeenCalledWith([jobs[1], jobs[0]]);
    } finally {
      rectSpy.mockRestore();
    }
  });

  it('renders per-file progress and retries only the selected row', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const jobs = [makeJob('active', 'uploading', 42), makeJob('failed', 'failed')];

    render(
      <UploadQueueList
        jobs={jobs}
        reorderDisabled
        onReorder={vi.fn()}
        onRetry={onRetry}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByRole('progressbar', { name: 'Uploading active.jpg' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    );
    await user.click(screen.getByRole('button', { name: 'Retry failed.jpg' }));
    expect(onRetry).toHaveBeenCalledWith('failed');
  });

  it('renders compact previews in a responsive proofing grid', async () => {
    const job = makeJob('proof');
    vi.mocked(createImageThumbnail).mockResolvedValueOnce({
      url: 'blob:proof-preview',
      cleanup: vi.fn(),
    });

    render(
      <UploadQueueList jobs={[job]} onReorder={vi.fn()} onRetry={vi.fn()} onRemove={vi.fn()} />,
    );

    const queue = screen.getByRole('list', { name: 'Upload queue' });
    expect(queue).toHaveClass('grid', 'grid-cols-2', 'sm:grid-cols-3', 'lg:grid-cols-4', 'gap-3');

    const preview = await screen.findByRole('img', { name: 'Preview of proof.jpg' });
    expect(preview).toHaveClass('h-full', 'w-full', 'object-cover');
    expect(createImageThumbnail).toHaveBeenCalledWith(job.file, 400);
  });

  it('does not generate thumbnails for queue rows outside the viewport', () => {
    const originalObserver = window.IntersectionObserver;
    class PassiveIntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      readonly root = null;
      readonly rootMargin = '0px';
      readonly thresholds = [0];
    }
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: PassiveIntersectionObserver,
    });
    vi.mocked(createImageThumbnail).mockClear();

    try {
      render(
        <UploadQueueList
          jobs={Array.from({ length: 200 }, (_, index) => makeJob(`queued-${index}`))}
          onReorder={vi.fn()}
          onRetry={vi.fn()}
          onRemove={vi.fn()}
        />,
      );

      expect(createImageThumbnail).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'IntersectionObserver', {
        configurable: true,
        writable: true,
        value: originalObserver,
      });
    }
  });
});
