import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UploadQueueList } from '../../../components/upload/UploadQueueList';
import type { UploadJob } from '../../../types';
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
  it.each(['reorder', 'remove', 'message'] as const)(
    'invalidates offscreen heights after %s and remeasures unchanged mounted rows',
    async (change) => {
      let top = 0;
      const measuredRows = vi.fn();
      let reportSizes = (_rows: HTMLElement[]) => {};
      const observerSpy = vi
        .spyOn(window, 'ResizeObserver')
        .mockImplementation(function (callback) {
          const observer: ResizeObserver = {
            observe(target) {
              if (target.getAttribute('role') === 'list')
                reportSizes = (rows) =>
                  callback(
                    rows.map(
                      (row) =>
                        ({
                          target: row,
                          contentRect: row.getBoundingClientRect(),
                        }) as ResizeObserverEntry,
                    ),
                    observer,
                  );
            },
            unobserve() {},
            disconnect() {},
          };
          return observer;
        });
      const rectSpy = vi
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(function () {
          const isRow = this.dataset.queueRow !== undefined;
          if (isRow) measuredRows(this);
          const height = isRow ? (this.textContent?.includes('Connection lost') ? 320 : 180) : 800;
          const y = this.getAttribute('role') === 'list' ? top : 0;
          return {
            x: 0,
            y,
            top: y,
            bottom: y + height,
            left: 0,
            right: 400,
            width: 400,
            height,
            toJSON: () => ({}),
          } as DOMRect;
        });
      try {
        let jobs = Array.from({ length: 100 }, (_, i) => makeJob(`queued-${i}`, 'uploading'));
        jobs[0] = makeJob('queued-0', 'failed');
        const actions = { onReorder: vi.fn(), onRetry: vi.fn(), onRemove: vi.fn() };
        const { container, rerender } = render(<UploadQueueList jobs={jobs} {...actions} />);
        const queue = screen.getByRole('list', { name: 'Upload queue' });
        act(() => reportSizes([...container.querySelectorAll<HTMLElement>('[data-queue-row]')]));
        await waitFor(() => {
          expect(container.querySelector<HTMLElement>('[data-queue-row="1"]')?.style.top).toBe(
            '332px',
          );
        });
        top = -100000;
        fireEvent.scroll(document);
        await waitFor(() =>
          expect(screen.getByRole('button', { name: 'Remove queued-99.jpg' })).toBeInTheDocument(),
        );
        act(() => reportSizes([...container.querySelectorAll<HTMLElement>('[data-queue-row]')]));
        await act(async () => {
          await new Promise((resolve) => requestAnimationFrame(resolve));
        });
        expect(container.querySelector('[data-queue-row="0"]')).toBeNull();
        const unchangedRow = container.querySelector<HTMLElement>('[data-queue-row="48"]')!;
        measuredRows.mockClear();
        if (change === 'reorder') jobs = [...jobs.slice(2), ...jobs.slice(0, 2)];
        else if (change === 'remove') jobs = jobs.slice(2);
        else
          jobs = jobs.map((job, i) =>
            i === 0 ? { ...job, status: 'uploading', error: undefined } : job,
          );
        await act(async () => rerender(<UploadQueueList jobs={jobs} {...actions} />));
        // Even rows whose DOM and height are unchanged must be measured again.
        expect(measuredRows).toHaveBeenCalledWith(unchangedRow);
        const rows = [...container.querySelectorAll<HTMLElement>('[data-queue-row]')];
        const estimated = 194 * 0.75 + 84;
        const rowCount = Math.ceil(jobs.length / 2);
        const measured = rows.reduce(
          (sum, row) => sum + (row.textContent?.includes('Connection lost') ? 320 : 180),
          0,
        );
        expect(Number.parseFloat(queue.style.height)).toBeCloseTo(
          measured + (rowCount - rows.length) * estimated + (rowCount - 1) * 12,
        );
        // A progress-only update keeps the measurements without layout reads.
        measuredRows.mockClear();
        jobs = jobs.map((job) => ({ ...job, progress: 42 }));
        await act(async () => rerender(<UploadQueueList jobs={jobs} {...actions} />));
        expect(measuredRows).not.toHaveBeenCalled();
      } finally {
        rectSpy.mockRestore();
        observerSpy.mockRestore();
      }
    },
  );

  it.each([
    { from: 4, to: 3, file: 0, control: 'Reorder' },
    { from: 4, to: 3, file: 6, control: 'Remove' },
    { from: 3, to: 2, file: 6, control: 'Reorder' },
    { from: 2, to: 4, file: 6, control: 'Remove' },
  ])(
    'retains the same file and control when regrouping $from → $to columns ($control)',
    async ({ from, to, file, control }) => {
      let columns = from;
      const originalStyle = window.getComputedStyle.bind(window);
      const styleSpy = vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
        const style = originalStyle(element);
        if (element.getAttribute('role') === 'list')
          Object.defineProperty(style, 'gridTemplateColumns', {
            value: Array(columns).fill('240px').join(' '),
            configurable: true,
          });
        return style;
      });
      try {
        render(
          <UploadQueueList
            jobs={Array.from({ length: 100 }, (_, i) => makeJob(`queued-${i}`))}
            onReorder={vi.fn()}
            onRetry={vi.fn()}
            onRemove={vi.fn()}
          />,
        );
        const name = new RegExp(`^${control} queued-${file}\\.jpg`);
        act(() => screen.getByRole('button', { name }).focus());
        expect(screen.getByRole('button', { name })).toHaveFocus();
        columns = to;
        fireEvent.resize(window);
        await waitFor(() => {
          expect(
            document.querySelectorAll('[data-queue-row="0"] > [data-upload-job]'),
          ).toHaveLength(to);
          expect(screen.getByRole('button', { name })).toHaveFocus();
        });
      } finally {
        styleSpy.mockRestore();
      }
    },
  );

  it('mounts a bounded window for an unbounded queue and reaches its final file', async () => {
    let top = 0;
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        const y = this.getAttribute('role') === 'list' ? top : 0;
        return {
          x: 0,
          y,
          top: y,
          bottom: y + 800,
          left: 0,
          right: 1000,
          width: 1000,
          height: 800,
          toJSON: () => ({}),
        } as DOMRect;
      });
    try {
      const { container } = render(
        <UploadQueueList
          jobs={Array.from({ length: 10000 }, (_, i) => makeJob(`queued-${i}`))}
          onReorder={vi.fn()}
          onRetry={vi.fn()}
          onRemove={vi.fn()}
        />,
      );
      expect(container.querySelectorAll('[data-upload-job]').length).toBeLessThan(80);
      expect(
        screen.getByRole('button', { name: /Reorder queued-0.jpg/ }).closest('li'),
      ).toHaveAttribute('aria-setsize', '10000');
      top = -10000000;
      fireEvent.scroll(document);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Remove queued-9999.jpg' })).toBeInTheDocument(),
      );
      expect(container.querySelectorAll('[data-upload-job]').length).toBeLessThan(80);
    } finally {
      rectSpy.mockRestore();
    }
  });

  it('retains the focused file during manual scrolling', async () => {
    let top = 0;
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        const y = this.getAttribute('role') === 'list' ? top : 0;
        return {
          x: 0,
          y,
          top: y,
          bottom: y + 800,
          left: 0,
          right: 1000,
          width: 1000,
          height: 800,
          toJSON: () => ({}),
        } as DOMRect;
      });
    try {
      render(
        <UploadQueueList
          jobs={Array.from({ length: 1000 }, (_, i) => makeJob(`queued-${i}`))}
          onReorder={vi.fn()}
          onRetry={vi.fn()}
          onRemove={vi.fn()}
        />,
      );
      const handle = screen.getByRole('button', { name: /Reorder queued-0.jpg/ });
      fireEvent.focus(handle);
      top = -1000000;
      fireEvent.scroll(document);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Remove queued-999.jpg' })).toBeInTheDocument(),
      );
      expect(handle).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove queued-2.jpg' })).toBeInTheDocument();
    } finally {
      rectSpy.mockRestore();
    }
  });

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
    expect(createImageThumbnail).toHaveBeenCalledWith(job.file, 400, expect.any(AbortSignal));
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
