import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

interface GalleryLoadErrorStateProps {
  error: string;
  onRetry: () => void;
}

export const GalleryInitialLoadingState = () => (
  <div className="space-y-6">
    <div className="h-10 w-56 rounded bg-surface-foreground/10 dark:bg-surface/20 animate-pulse" />
    <div className="rounded-2xl border border-border bg-surface p-6 dark:bg-surface-foreground/5">
      <div className="flex items-center gap-3 text-muted">
        <Loader2 className="w-5 h-5 animate-spin text-accent" />
        <span className="text-sm font-medium">Loading gallery content...</span>
      </div>
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="aspect-4/3 rounded-xl bg-surface-foreground/10 dark:bg-surface/20 animate-pulse"
          />
        ))}
      </div>
    </div>
  </div>
);

export const GalleryLoadErrorState = ({ error, onRetry }: GalleryLoadErrorStateProps) => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="flex flex-col items-center gap-4">
      <div className="text-danger text-lg font-medium">Failed to load gallery</div>
      <div className="text-muted dark:text-muted-dark">{error}</div>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-accent text-accent-foreground rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-accent/20"
      >
        Try Again
      </button>
    </div>
  </div>
);

export const GalleryNotFoundState = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="text-center space-y-4">
      <div className="text-muted dark:text-muted-dark text-lg">Gallery not found</div>
      <Link to="/" className="text-accent hover:underline">
        ← Back to Dashboard
      </Link>
    </div>
  </div>
);
