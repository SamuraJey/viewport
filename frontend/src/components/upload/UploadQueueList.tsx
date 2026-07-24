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
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { UploadQueueItem } from './UploadQueueItem';
import type { UploadJob } from './types';

interface UploadQueueListProps {
  jobs: UploadJob[];
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

export const UploadQueueList = ({
  jobs,
  reorderDisabled = false,
  actionsDisabled = false,
  retryDisabled = false,
  resizingJobId = null,
  onReorder,
  onRetry,
  onRemove,
  onResize,
}: UploadQueueListProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = jobs.findIndex((job) => job.id === active.id);
    const newIndex = jobs.findIndex((job) => job.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(jobs, oldIndex, newIndex));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Press space to pick up a file. Use the up and down arrow keys to move it. Press space again to drop, or escape to cancel.',
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
      <SortableContext items={jobs.map((job) => job.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2" aria-label="Upload queue">
          {jobs.map((job, index) => (
            <UploadQueueItem
              key={job.id}
              job={job}
              index={index}
              totalCount={jobs.length}
              reorderDisabled={reorderDisabled}
              actionsDisabled={actionsDisabled}
              retryDisabled={retryDisabled}
              isResizing={resizingJobId === job.id}
              onRetry={onRetry}
              onRemove={onRemove}
              onResize={onResize}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
};
