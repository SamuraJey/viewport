import { AlertCircle } from 'lucide-react';
import { Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';

export const PublicGallerySkeleton = () => (
  <div className="min-h-screen bg-surface" data-testid="skeleton-loader">
    <div className="h-screen bg-surface-foreground/10 dark:bg-surface/10 animate-pulse flex items-center justify-center rounded-b-3xl">
      <div className="text-center space-y-5">
        <div className="h-4 w-32 bg-surface-foreground/20 dark:bg-surface/20 rounded-full mx-auto" />
        <div className="h-14 w-80 bg-surface-foreground/20 dark:bg-surface/20 rounded-xl mx-auto" />
        <div className="h-5 w-48 bg-surface-foreground/20 dark:bg-surface/20 rounded-full mx-auto" />
      </div>
    </div>

    <div className="w-full px-4 sm:px-6 lg:px-10 py-16">
      <div className="bg-surface-foreground/5 rounded-3xl p-6 sm:p-8 border border-border/50 shadow-xs">
        <div className="h-8 w-40 bg-surface-foreground/20 dark:bg-surface/20 rounded-lg mb-8 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-4/3 bg-surface-foreground/10 dark:bg-surface/10 rounded-xl animate-pulse"
              style={{ animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  </div>
);

interface PublicGalleryErrorProps {
  error: string;
}

export const PublicGalleryError = ({ error }: PublicGalleryErrorProps) => (
  <div className="min-h-screen bg-surface dark:bg-surface-foreground/5 flex items-center justify-center p-4">
    <div className="w-full max-w-md bg-surface dark:bg-surface-dark rounded-3xl p-8 sm:p-10 shadow-2xl border border-border/50 dark:border-white/5 text-center">
      <div className="w-20 h-20 bg-danger/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <AlertCircle className="w-10 h-10 text-danger" />
      </div>
      <h1 className="mb-3 text-3xl font-bold tracking-tight text-text">Gallery Not Available</h1>
      <p className="text-lg font-medium text-muted">{error}</p>
    </div>
  </div>
);

export const PublicGalleryExpired = () => (
  <div className="min-h-screen bg-surface dark:bg-surface-foreground/5 flex items-center justify-center p-4">
    <div className="w-full max-w-lg bg-surface dark:bg-surface-dark rounded-3xl p-8 sm:p-10 shadow-2xl border border-border/50 dark:border-white/5 text-center">
      <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <Clock3 className="w-10 h-10 text-accent" />
      </div>
      <h1 className="mb-3 text-3xl font-bold tracking-tight text-text">Link Has Expired</h1>
      <p className="text-base font-medium text-muted sm:text-lg">
        This share link is no longer active. Ask the photographer for a new one.
      </p>

      <Link
        to="/"
        className="mt-7 inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
      >
        Go to home page
      </Link>
    </div>
  </div>
);
