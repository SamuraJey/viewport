import { AlertCircle } from 'lucide-react';
import { Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';

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
