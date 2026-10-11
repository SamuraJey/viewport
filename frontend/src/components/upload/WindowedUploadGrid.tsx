import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface Props {
  count: number;
  layoutKey: string;
  pinnedIndices: number[];
  children: (start: number, end: number) => ReactNode;
  onFocusCapture: React.FocusEventHandler<HTMLDivElement>;
  onBlurCapture: React.FocusEventHandler<HTMLDivElement>;
}

const GRID_CLASSES = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4';
const GAP = 12;
const OVERSCAN_ROWS = 2;
type RowSize = { width: number; height: number };

// Variable-height rows keep validation/retry messages readable. Only nearby
// rows mount cards, observers, sortables, and preview jobs; the queue is unbounded.
export function WindowedUploadGrid({
  count,
  layoutKey,
  pinnedIndices,
  children,
  onFocusCapture,
  onBlurCapture,
}: Props) {
  const root = useRef<HTMLDivElement | null>(null);
  const measurements = useRef(new Map<number, RowSize>());
  const frame = useRef<number | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const committedColumns = useRef(2);
  const regroupFocus = useRef<{ jobId: string; control: string; element: HTMLElement } | null>(
    null,
  );
  const [geometry, setGeometry] = useState({
    columns: 2,
    width: 0,
    top: 0,
    bottom: 800,
    measurements: new Map<number, RowSize>(),
  });
  const measure = useCallback(() => {
    frame.current = null;
    const element = root.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const template = getComputedStyle(element).gridTemplateColumns;
    const columns = template && template !== 'none' ? template.split(' ').length : 2;
    if (columns !== committedColumns.current) {
      const active = document.activeElement;
      const control = active instanceof HTMLElement ? active.dataset.uploadControl : undefined;
      const jobId =
        active instanceof HTMLElement
          ? active.closest<HTMLElement>('[data-upload-job]')?.dataset.uploadJob
          : undefined;
      regroupFocus.current =
        control && jobId && element.contains(active)
          ? { jobId, control, element: active as HTMLElement }
          : null;
    }
    let parent = element.parentElement;
    while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY))
      parent = parent.parentElement;
    const viewport = parent?.getBoundingClientRect();
    const top = Math.max(0, (viewport?.top ?? 0) - rect.top);
    const bottom = Math.max(top, (viewport?.bottom ?? window.innerHeight) - rect.top);
    setGeometry({
      columns,
      width: rect.width,
      top,
      bottom,
      measurements: new Map(measurements.current),
    });
  }, []);
  const schedule = useCallback(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(measure);
  }, [measure]);

  useLayoutEffect(() => {
    committedColumns.current = geometry.columns;
    const saved = regroupFocus.current;
    regroupFocus.current = null;
    if (
      !saved ||
      (document.activeElement !== document.body && document.activeElement !== saved.element)
    )
      return;
    const card = [...(root.current?.querySelectorAll<HTMLElement>('[data-upload-job]') ?? [])].find(
      (node) => node.dataset.uploadJob === saved.jobId,
    );
    const control = [...(card?.querySelectorAll<HTMLElement>('[data-upload-control]') ?? [])].find(
      (node) => node.dataset.uploadControl === saved.control,
    );
    control?.focus({ preventScroll: true });
  }, [geometry.columns]);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    observer.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const index = (entry.target as HTMLElement).dataset.queueRow;
        if (index !== undefined)
          measurements.current.set(Number(index), {
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
      }
      schedule();
    });
    observer.current.observe(element);
    element.querySelectorAll('[data-queue-row]').forEach((row) => observer.current?.observe(row));
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    measure();
    return () => {
      observer.current?.disconnect();
      observer.current = null;
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [measure, schedule]);

  const attachRow = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const { width, height } = node.getBoundingClientRect();
      measurements.current.set(Number(node.dataset.queueRow), { width, height });
      observer.current?.observe(node);
      if (observer.current) schedule();
      return () => observer.current?.unobserve(node);
    },
    [schedule],
  );

  useLayoutEffect(() => {
    // Offscreen rows may now contain different files. Unchanged mounted rows
    // will not emit a ResizeObserver entry, so remeasure them before publishing.
    measurements.current.clear();
    root.current?.querySelectorAll<HTMLElement>('[data-queue-row]').forEach((row) => {
      const { width, height } = row.getBoundingClientRect();
      measurements.current.set(Number(row.dataset.queueRow), { width, height });
    });
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    measure();
  }, [layoutKey, geometry.columns, measure]);
  const rowCount = Math.ceil(count / geometry.columns);
  const offsets = useMemo(() => {
    const cardWidth = Math.max(
      100,
      (geometry.width - GAP * (geometry.columns - 1)) / geometry.columns,
    );
    const estimatedHeight = cardWidth * 0.75 + 84;
    const result = [0];
    for (let row = 0; row < rowCount; row++) {
      const measured = geometry.measurements.get(row);
      result.push(
        result[row] +
          (measured?.width === geometry.width ? measured.height : estimatedHeight) +
          GAP,
      );
    }
    return result;
  }, [rowCount, geometry]);
  let first = 0;
  while (first < rowCount - 1 && offsets[first + 1] < geometry.top) first++;
  let last = first;
  while (last < rowCount - 1 && offsets[last] < geometry.bottom) last++;
  const rows = new Set<number>();
  for (
    let row = Math.max(0, first - OVERSCAN_ROWS);
    row <= Math.min(rowCount - 1, last + OVERSCAN_ROWS);
    row++
  )
    rows.add(row);
  // Retain focused/dragged cards plus their neighbors, even during manual scroll.
  // Tab and arrow-key moves always have adjacent mounted targets available.
  for (const index of pinnedIndices) {
    if (index < 0) continue;
    const pinned = Math.floor(index / geometry.columns);
    for (let row = Math.max(0, pinned - 1); row <= Math.min(rowCount - 1, pinned + 1); row++)
      rows.add(row);
  }

  return (
    <div
      ref={root}
      role="list"
      aria-label="Upload queue"
      className={`${GRID_CLASSES} relative`}
      style={{ height: Math.max(0, offsets[rowCount] - GAP) }}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
    >
      {[...rows]
        .sort((a, b) => a - b)
        .map((row) => (
          <div
            key={`${geometry.columns}-${row}`}
            ref={attachRow}
            data-queue-row={row}
            role="presentation"
            className={`${GRID_CLASSES} absolute inset-x-0`}
            style={{ top: offsets[row] }}
          >
            {children(row * geometry.columns, Math.min(count, (row + 1) * geometry.columns))}
          </div>
        ))}
    </div>
  );
}
