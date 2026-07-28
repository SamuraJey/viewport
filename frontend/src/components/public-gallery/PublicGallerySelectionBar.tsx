import { CheckCircle2, Heart } from 'lucide-react';

import type { SelectionConfig, SelectionSession } from '../../types';

interface PublicGallerySelectionBarProps {
  config: SelectionConfig;
  session: SelectionSession;
  isMutating: boolean;
  onOpenFavorites: () => void;
  onFinishSelection: () => void;
}

const getStatusLabel = (status: SelectionSession['status']) => {
  if (status === 'in_progress') return 'Selection in progress';
  if (status === 'submitted') return 'Selection submitted';
  if (status === 'closed') return 'Selection closed';
  return `Selection ${status.replaceAll('_', ' ')}`;
};

export const PublicGallerySelectionBar = ({
  config,
  session,
  isMutating,
  onOpenFavorites,
  onFinishSelection,
}: PublicGallerySelectionBarProps) => {
  const selectedCount = Math.max(0, session.selected_count);
  const limit =
    config.limit_enabled && typeof config.limit_value === 'number' && config.limit_value > 0
      ? config.limit_value
      : null;
  const progress = limit === null ? null : Math.min(100, Math.max(0, (selectedCount / limit) * 100));
  const canFinish = session.status === 'in_progress';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10">
      <section
        data-testid="public-gallery-selection-bar"
        aria-label="Selection controls"
        className="pointer-events-auto mx-auto grid w-full max-w-6xl gap-4 rounded-2xl bg-surface/95 px-4 py-4 shadow-xl backdrop-blur-xl sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"
      >
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-sm font-bold text-text">
              {limit === null
                ? `${selectedCount} selected`
                : `${selectedCount} of ${limit} selected`}
            </p>
            <p className="text-sm text-muted">{getStatusLabel(session.status)}</p>
          </div>
          {progress !== null ? (
            <div
              role="progressbar"
              aria-label={`${selectedCount} of ${limit} photos selected`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={onOpenFavorites}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-surface-1 px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent"
          >
            <Heart className="h-4 w-4" />
            Open favorites
          </button>
          {canFinish ? (
            <button
              type="button"
              onClick={onFinishSelection}
              disabled={isMutating}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              {isMutating ? 'Finishing…' : 'Finish selection'}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
};
