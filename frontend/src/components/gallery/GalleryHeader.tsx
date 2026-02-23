import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Loader2, Trash2 } from 'lucide-react';
import { formatDateOnly } from '../../lib/utils';
import type { GalleryDetail } from '../../types';

interface GalleryHeaderProps {
  gallery: GalleryDetail;
  shootingDateInput: string;
  setShootingDateInput: (date: string) => void;
  isSavingShootingDate: boolean;
  onSaveShootingDate: () => void;
  onDeleteGallery: () => void;
}

export const GalleryHeader = ({
  gallery,
  shootingDateInput,
  setShootingDateInput,
  isSavingShootingDate,
  onSaveShootingDate,
  onDeleteGallery,
}: GalleryHeaderProps) => {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 dark:border-border/30 dark:bg-surface-foreground/5 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <Link
            to="/"
            className="inline-flex h-9 w-fit items-center gap-1.5 rounded-lg border border-border/60 bg-surface-1 px-3 text-sm font-medium text-muted transition-colors hover:border-accent/40 hover:text-accent dark:border-border/40 dark:bg-surface-dark-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Galleries
          </Link>
          <h1 className="font-oswald text-3xl font-bold leading-tight tracking-wide text-text uppercase sm:text-4xl">
            {gallery.name || `Gallery #${gallery.id}`}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="sr-only" htmlFor="gallery-shooting-date">
            Shooting date
          </label>
          <span className="rounded-md bg-surface-1 px-2.5 py-2 text-xs font-semibold uppercase tracking-wide text-muted dark:bg-surface-dark-1">
            Shooting date
          </span>
          <input
            id="gallery-shooting-date"
            type="date"
            value={shootingDateInput}
            onChange={(e) => setShootingDateInput(e.target.value)}
            className="h-10 rounded-lg border border-border bg-surface-1 px-3 text-text shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 dark:border-border/40 dark:bg-surface-dark-1"
          />
          <button
            onClick={onSaveShootingDate}
            disabled={
              isSavingShootingDate ||
              !shootingDateInput ||
              shootingDateInput === gallery.shooting_date?.slice(0, 10)
            }
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-accent bg-accent px-3 text-sm font-semibold text-accent-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
          >
            {isSavingShootingDate ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save date
          </button>
          <span className="rounded-md bg-surface-1 px-2.5 py-2 text-xs text-muted dark:bg-surface-dark-1">
            Created {formatDateOnly(gallery.created_at)}
          </span>
          <button
            onClick={onDeleteGallery}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-danger/20 bg-danger/10 px-4 text-danger shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-danger/20 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-1 active:scale-95 dark:bg-danger/20"
            title="Delete Gallery"
            aria-label="Delete gallery"
          >
            <Trash2 className="h-4 w-4" />
            Delete Gallery
          </button>
        </div>
      </div>
    </div>
  );
};
