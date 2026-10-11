import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { UploadQueueItem } from './UploadQueueItem';
import { WindowedUploadGrid } from './WindowedUploadGrid';
import type { UploadJob } from '../../types';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

interface UploadQueueListProps {
  jobs: UploadJob[];
  jobIds?: string[];
  reorderDisabled?: boolean;
  actionsDisabled?: boolean;
  retryDisabled?: boolean;
  resizingJobId?: string | null;
  onReorder: (jobs: UploadJob[]) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onResize?: (id: string) => void;
}

const findPosition = (jobs: UploadJob[], id: string | number): number | null => {
  const index = jobs.findIndex((job) => job.id === String(id));
  return index < 0 ? null : index + 1;
};

// Sensor descriptors feed dnd-kit's shared context; recreating these options
// broadcasts to every sortable card even when its React props are unchanged.
const POINTER_OPTIONS = { activationConstraint: { distance: 6 } };
const KEYBOARD_OPTIONS = {
  coordinateGetter: sortableKeyboardCoordinates,
  scrollBehavior: 'auto' as const,
};

export const UploadQueueList = ({
  jobs,
  jobIds,
  reorderDisabled = false,
  actionsDisabled = false,
  retryDisabled = false,
  resizingJobId = null,
  onReorder,
  onRetry,
  onRemove,
  onResize,
}: UploadQueueListProps) => {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const latestActions = useRef({ onRetry, onRemove, onResize });
  useLayoutEffect(() => {
    latestActions.current = { onRetry, onRemove, onResize };
  }, [onRetry, onRemove, onResize]);
  const cardActions = useMemo(
    () => ({
      onRetry: (id: string) => latestActions.current.onRetry(id),
      onRemove: (id: string) => latestActions.current.onRemove(id),
      onResize: (id: string) => latestActions.current.onResize?.(id),
    }),
    [],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_OPTIONS),
  );
  // SortableContext must not broadcast a new item list for each progress tick.
  const idsKey = jobIds ? '' : JSON.stringify(jobs.map((job) => job.id));
  const sortableIds = useMemo<string[]>(() => jobIds ?? JSON.parse(idsKey), [jobIds, idsKey]);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDraggedId(null);
    if (!over || active.id === over.id) return;
    const oldIndex = jobs.findIndex((job) => job.id === active.id);
    const newIndex = jobs.findIndex((job) => job.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(jobs, oldIndex, newIndex));
  };

  const renderItems = (start: number, end: number) =>
    jobs
      .slice(start, end)
      .map((job, offset) => (
        <UploadQueueItem
          key={job.id}
          job={job}
          index={start + offset}
          totalCount={jobs.length}
          reorderDisabled={reorderDisabled}
          actionsDisabled={actionsDisabled}
          retryDisabled={retryDisabled}
          isResizing={resizingJobId === job.id}
          onRetry={cardActions.onRetry}
          onRemove={cardActions.onRemove}
          onResize={onResize ? cardActions.onResize : undefined}
        />
      ));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      onDragStart={({ active }) => setDraggedId(String(active.id))}
      onDragCancel={() => setDraggedId(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Press space to pick up a file. Use the arrow keys to move it through the grid. Press space again to drop, or escape to cancel.',
        },
        announcements: {
          onDragStart: ({ active }) =>
            `Picked up ${jobs.find((job) => job.id === active.id)?.filename ?? 'file'}.`,
          onDragOver: ({ active, over }) => {
            if (!over) return undefined;
            const name = jobs.find((job) => job.id === active.id)?.filename ?? 'File';
            const position = findPosition(jobs, over.id);
            return `${name} is over position ${position ?? 'unknown'} of ${jobs.length}.`;
          },
          onDragEnd: ({ active, over }) => {
            const name = jobs.find((job) => job.id === active.id)?.filename ?? 'File';
            if (!over) return `${name} was not moved.`;
            return `${name} was placed at position ${findPosition(jobs, over.id) ?? 'unknown'} of ${jobs.length}.`;
          },
          onDragCancel: ({ active }) =>
            `Moving ${jobs.find((job) => job.id === active.id)?.filename ?? 'file'} was cancelled.`,
        },
      }}
    >
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        {jobs.length > 80 && typeof ResizeObserver !== 'undefined' ? (
          <WindowedUploadGrid
            count={jobs.length}
            pinnedIndices={[
              jobs.findIndex((job) => job.id === draggedId),
              jobs.findIndex((job) => job.id === focusedId),
            ]}
            onFocusCapture={(event) => {
              const card = (event.target as HTMLElement).closest<HTMLElement>('[data-upload-job]');
              setFocusedId(card?.dataset.uploadJob ?? null);
            }}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                setFocusedId(null);
            }}
          >
            {renderItems}
          </WindowedUploadGrid>
        ) : (
          <ul
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            aria-label="Upload queue"
          >
            {renderItems(0, jobs.length)}
          </ul>
        )}
      </SortableContext>
    </DndContext>
  );
};
