import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

interface GalleryLoadErrorStateProps {
  error: string;
  onRetry: () => void;
}

export const GalleryInitialLoadingState = () => (
  <div className="space-y-6">
    <div className="h-12 w-64 rounded-xl bg-surface-foreground/10 dark:bg-surface/20 animate-pulse" />
    <div className="rounded-3xl border border-border/50 bg-surface p-8 dark:border-border/30 dark:bg-surface-foreground/5 shadow-xs">
      <div className="flex items-center gap-4 text-muted">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        <span className="text-base font-bold">Loading gallery content...</span>
      </div>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="aspect-4/3 rounded-2xl bg-surface-foreground/10 dark:bg-surface/20 animate-pulse"
          />
        ))}
      </div>
    </div>
  </div>
);

export const GalleryLoadErrorState = ({ error, onRetry }: GalleryLoadErrorStateProps) => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="flex flex-col items-center gap-5 bg-surface dark:bg-surface-foreground/5 p-8 rounded-3xl border border-border/50 dark:border-border/30 shadow-xs">
      <div className="text-danger text-xl font-bold">Failed to load gallery</div>
      <div className="text-muted dark:text-muted-dark font-medium">{error}</div>
      <button
        onClick={onRetry}
        className="px-6 py-3 bg-accent text-accent-foreground font-bold rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-accent/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:translate-y-0"
      >
        Try Again
      </button>
    </div>
  </div>
);

export const GalleryNotFoundState = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="text-center space-y-6 bg-surface dark:bg-surface-foreground/5 p-10 rounded-3xl border border-border/50 dark:border-border/30 shadow-xs">
      <div className="text-muted dark:text-muted-dark text-xl font-bold">Gallery not found</div>
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-accent hover:text-accent/80 font-bold transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent rounded-lg px-2 py-1"
      >
        ← Back to Dashboard
      </Link>
    </div>
  </div>
);
