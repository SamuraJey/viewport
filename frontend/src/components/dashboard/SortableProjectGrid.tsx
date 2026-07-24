import { useState } from 'react';
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
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

import type { Project } from '../../types';
import { ProjectCard } from './ProjectCard';
import { ProjectCardHeader } from './ProjectCardHeader';
import { ProjectCardMetrics } from './ProjectCardMetrics';

interface ProjectActions {
  onCopyLink: (project: Project) => void;
  onOpenProject: (project: Project) => void;
  onOpenShare: (project: Project) => void;
  onRename: (project: Project) => void;
  onAddGallery: (project: Project) => void;
  onCreateShareLink: (project: Project) => void;
  onSettings: (project: Project) => void;
  onDelete: (project: Project) => void;
}

interface SortableProjectGridProps extends ProjectActions {
  projects: Project[];
  disabled?: boolean;
  onReorder: (projects: Project[]) => void;
  onAnnouncement: (message: string) => void;
}

interface SortableProjectCardProps extends ProjectActions {
  project: Project;
  disabled: boolean;
}

const findProjectName = (projects: Project[], id: string | number) =>
  projects.find((project) => project.id === String(id))?.name ?? 'Project';

const findProjectPosition = (projects: Project[], id: string | number) => {
  const index = projects.findIndex((project) => project.id === String(id));
  return index >= 0 ? index + 1 : null;
};

export const describeProjectDragStart = (
  projects: Project[],
  id: string | number,
) => {
  const position = findProjectPosition(projects, id);
  return `Picked up ${findProjectName(projects, id)}${
    position ? `, position ${position} of ${projects.length}` : ''
  }.`;
};

const SortableProjectCard = ({
  project,
  disabled,
  ...actions
}: SortableProjectCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id, disabled });

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
      <ProjectCard
        project={project}
        {...actions}
        dragHandle={
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            disabled={disabled}
            className="flex h-9 w-9 touch-none items-center justify-center rounded-lg bg-black/65 text-white shadow-md transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-45"
            aria-label={
              disabled
                ? `Manual order is required to move ${project.name}`
                : `Move ${project.name}`
            }
          >
            <GripVertical className="h-5 w-5" aria-hidden="true" />
          </button>
        }
      />
    </div>
  );
};

export const SortableProjectGrid = ({
  projects,
  disabled = false,
  onReorder,
  onAnnouncement,
  ...actions
}: SortableProjectGridProps) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const activeProject = projects.find((project) => project.id === activeId) ?? null;

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIndex = projects.findIndex((project) => project.id === active.id);
    const newIndex = projects.findIndex((project) => project.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(projects, oldIndex, newIndex);
    onReorder(reordered);
    onAnnouncement(`${reordered[newIndex].name} moved to position ${newIndex + 1}.`);
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
            'Press space to pick up a project. Use arrow keys to move it. Press space again to drop, or escape to cancel.',
        },
        announcements: {
          onDragStart: ({ active }) => describeProjectDragStart(projects, active.id),
          onDragOver: ({ active, over }) => {
            if (!over) return undefined;
            const position = findProjectPosition(projects, over.id);
            return `${findProjectName(projects, active.id)} is over${
              position ? ` position ${position} of ${projects.length}` : ' another project'
            }.`;
          },
          onDragEnd: ({ active, over }) => {
            if (!over) return `${findProjectName(projects, active.id)} was not moved.`;
            const position = findProjectPosition(projects, over.id);
            return `${findProjectName(projects, active.id)} was dropped${
              position ? ` at position ${position} of ${projects.length}` : ''
            }.`;
          },
          onDragCancel: ({ active }) =>
            `Moving ${findProjectName(projects, active.id)} was cancelled.`,
        },
      }}
    >
      <SortableContext items={projects.map((project) => project.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <SortableProjectCard
              key={project.id}
              project={project}
              disabled={disabled}
              {...actions}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeProject ? (
          <div
            className="w-[min(24rem,calc(100vw-2rem))] rotate-1 overflow-hidden rounded-2xl bg-surface opacity-95 shadow-xl ring-1 ring-border/55 dark:bg-surface-dark"
            aria-hidden="true"
          >
            <ProjectCardHeader project={activeProject} isPreviewVisible={false} />
            <div className="px-4 py-4">
              <p className="line-clamp-2 text-xl font-bold leading-6 text-text">
                {activeProject.name}
              </p>
            </div>
            <ProjectCardMetrics project={activeProject} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
