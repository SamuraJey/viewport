import { useState, type ReactNode } from 'react';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ImageIcon } from 'lucide-react';
import { motion } from 'framer-motion';

import type { ProjectGallerySummary } from '../../../types';
import { containerVariants } from '../constants';
import { describeGalleryDragStart } from '../projectGalleryDnd';

interface SortableProjectGalleryGridProps {
  galleries: ProjectGallerySummary[];
  disabled?: boolean;
  requiresConfirmation?: boolean;
  onMove: (gallery: ProjectGallerySummary, targetIndex: number) => void;
  renderGallery: (
    gallery: ProjectGallerySummary,
    index: number,
    dragHandle: ReactNode,
  ) => ReactNode;
}

interface SortableProjectGalleryProps {
  gallery: ProjectGallerySummary;
  index: number;
  disabled: boolean;
  renderGallery: SortableProjectGalleryGridProps['renderGallery'];
}

const findGallery = (galleries: ProjectGallerySummary[], id: string | number) =>
  galleries.find((gallery) => gallery.id === String(id));

const findGalleryPosition = (galleries: ProjectGallerySummary[], id: string | number) => {
  const index = galleries.findIndex((gallery) => gallery.id === String(id));
  return index >= 0 ? index + 1 : null;
};

const SortableProjectGallery = ({
  gallery,
  index,
  disabled,
  renderGallery,
}: SortableProjectGalleryProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: gallery.id, disabled });

  const dragHandle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      disabled={disabled}
      className="inline-flex h-9 touch-none cursor-grab items-center justify-center gap-1.5 rounded-xl border border-border/55 bg-surface-1 px-3 text-xs font-semibold text-muted shadow-xs transition-colors hover:border-accent/45 hover:text-accent focus:cursor-grabbing focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent dark:border-border/40 dark:bg-surface-dark-1 disabled:cursor-not-allowed disabled:opacity-45"
      aria-label={`Move ${gallery.name}`}
      title="Drag to change presentation order"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <span className="sr-only">Current position {index + 1}</span>
      <GripVertical className="h-4 w-4" aria-hidden="true" />
      Reorder
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
      className="min-w-0"
    >
      {renderGallery(gallery, index, dragHandle)}
    </div>
  );
};

export const SortableProjectGalleryGrid = ({
  galleries,
  disabled = false,
  requiresConfirmation = false,
  onMove,
  renderGallery,
}: SortableProjectGalleryGridProps) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const activeGallery = activeId ? findGallery(galleries, activeId) : null;

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = galleries.findIndex((gallery) => gallery.id === active.id);
    const newIndex = galleries.findIndex((gallery) => gallery.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const movedGallery = galleries[oldIndex];
    onMove(movedGallery, newIndex);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Press space to pick up a gallery. Use arrow keys to move it. Press space again to drop, or escape to cancel.',
        },
        announcements: {
          onDragStart: ({ active }) => describeGalleryDragStart(galleries, active.id),
          onDragOver: ({ active, over }) => {
            if (!over) return undefined;
            const position = findGalleryPosition(galleries, over.id);
            return `${findGallery(galleries, active.id)?.name ?? 'Gallery'} is over${
              position ? ` position ${position} of ${galleries.length}` : ' another gallery'
            }.`;
          },
          onDragEnd: ({ active, over }) => {
            const name = findGallery(galleries, active.id)?.name ?? 'Gallery';
            if (!over) return `${name} was not moved.`;
            if (active.id === over.id) {
              return `${name} was returned to its original position.`;
            }
            const position = findGalleryPosition(galleries, over.id);
            if (requiresConfirmation) {
              return `${name} reorder requested${
                position ? ` for position ${position} of ${galleries.length}` : ''
              }. Confirm to apply it.`;
            }
            return `${name} was dropped${
              position ? ` at position ${position} of ${galleries.length}` : ''
            }.`;
          },
          onDragCancel: ({ active }) =>
            `Moving ${findGallery(galleries, active.id)?.name ?? 'gallery'} was cancelled.`,
        },
      }}
    >
      <SortableContext
        items={galleries.map((gallery) => gallery.id)}
        strategy={rectSortingStrategy}
      >
        <motion.div
          className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {galleries.map((gallery, index) => (
            <SortableProjectGallery
              key={gallery.id}
              gallery={gallery}
              index={index}
              disabled={disabled}
              renderGallery={renderGallery}
            />
          ))}
        </motion.div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeGallery ? (
          <div
            data-testid="gallery-drag-preview"
            className="flex h-20 w-[min(20rem,calc(100vw-2rem))] rotate-1 items-center gap-3 overflow-hidden rounded-2xl border border-card-border bg-surface p-2 opacity-95 shadow-[0_18px_40px_rgba(15,23,42,0.24)] dark:bg-surface-dark"
            aria-hidden="true"
          >
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-2 dark:bg-surface-dark-2">
              {activeGallery.cover_photo_thumbnail_url ? (
                <img
                  src={activeGallery.cover_photo_thumbnail_url}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-linear-to-br from-accent/12 via-surface-2 to-surface text-accent dark:via-surface-dark-2 dark:to-surface-dark">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 pr-2">
              <p className="text-xs font-semibold text-accent">Moving gallery</p>
              <p className="mt-0.5 truncate font-oswald text-lg font-bold uppercase text-text">
                {activeGallery.name}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Position {findGalleryPosition(galleries, activeGallery.id)} of {galleries.length}
              </p>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
