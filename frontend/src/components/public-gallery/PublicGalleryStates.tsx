import { AlertCircle } from 'lucide-react';
import { Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';

export const PublicGallerySkeleton = () => (
  <div className="min-h-screen bg-surface dark:bg-surface-dark" data-testid="skeleton-loader">
    <div className="flex h-screen animate-pulse items-center justify-center rounded-b-3xl bg-surface-foreground/10 dark:bg-surface/10">
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
  <div className="flex min-h-screen items-center justify-center bg-surface p-4 text-text dark:bg-surface-dark">
    <div className="w-full max-w-md rounded-3xl border border-border/50 bg-surface p-8 text-center shadow-2xl dark:border-white/10 dark:bg-surface-dark-1 sm:p-10">
      <div className="w-20 h-20 bg-danger/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <AlertCircle className="w-10 h-10 text-danger" />
      </div>
      <h1 className="mb-3 text-3xl font-bold tracking-tight text-text">Gallery Not Available</h1>
      <p className="text-lg font-medium text-muted">{error}</p>
    </div>
  </div>
);

export const PublicGalleryExpired = () => (
  <div className="flex min-h-screen items-center justify-center bg-surface p-4 text-text dark:bg-surface-dark">
    <div className="w-full max-w-lg rounded-3xl border border-border/50 bg-surface p-8 text-center shadow-2xl dark:border-white/10 dark:bg-surface-dark-1 sm:p-10">
      <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <Clock3 className="w-10 h-10 text-accent" />
      </div>
      <h1 className="mb-3 text-3xl font-bold tracking-tight text-text">Link Has Expired</h1>
      <p className="text-base font-medium text-muted sm:text-lg">
        This share link is no longer active. Ask the photographer for a new one.
      </p>

      <Link
        to="/"
        className="mt-7 inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent/90 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        Go to home page
      </Link>
    </div>
  </div>
);
