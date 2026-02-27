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
    <div className="rounded-3xl border border-border/50 bg-surface p-6 dark:border-border/30 dark:bg-surface-foreground/5 sm:p-8 shadow-xs">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-5">
          <Link
            to="/"
            className="inline-flex h-10 w-fit items-center gap-2.5 rounded-xl border border-border/60 bg-surface-1 px-4 text-sm font-semibold text-muted transition-all duration-200 hover:border-accent/40 hover:text-accent hover:bg-accent/5 hover:-translate-y-0.5 hover:shadow-sm dark:border-border/40 dark:bg-surface-dark-1 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Galleries
          </Link>
          <h1 className="font-oswald text-4xl font-bold leading-tight tracking-wide text-text uppercase sm:text-5xl drop-shadow-xs">
            {gallery.name || `Gallery #${gallery.id}`}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="sr-only" htmlFor="gallery-shooting-date">
            Shooting date
          </label>
          <div className="flex items-center bg-surface-1 dark:bg-surface-dark-1 rounded-2xl border border-border/50 dark:border-border/40 p-1.5 shadow-xs focus-within:ring-2 focus-within:ring-accent/30 focus-within:border-accent/50 transition-all duration-200">
            <span className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted">
              Shooting date
            </span>
            <input
              id="gallery-shooting-date"
              type="date"
              value={shootingDateInput}
              onChange={(e) => setShootingDateInput(e.target.value)}
              className="h-10 rounded-xl border-none bg-transparent px-3 text-sm font-medium text-text focus:outline-hidden"
            />
            <button
              onClick={onSaveShootingDate}
              disabled={
                isSavingShootingDate ||
                !shootingDateInput ||
                shootingDateInput === gallery.shooting_date?.slice(0, 10)
              }
              className="ml-1.5 inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-accent-foreground transition-all duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {isSavingShootingDate ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save
            </button>
          </div>

          <div className="flex items-center gap-4 ml-auto lg:ml-0">
            <span className="text-xs font-medium text-muted bg-surface-1 dark:bg-surface-dark-1 px-3 py-1.5 rounded-lg border border-border/30">
              Created {formatDateOnly(gallery.created_at)}
            </span>
            <button
              onClick={onDeleteGallery}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-danger/20 bg-danger/5 px-5 text-sm font-bold text-danger transition-all duration-200 hover:bg-danger/10 hover:border-danger/30 hover:-translate-y-0.5 hover:shadow-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:translate-y-0"
              title="Delete Gallery"
              aria-label="Delete gallery"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
