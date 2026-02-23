import { AlertCircle } from 'lucide-react';

export const PublicGallerySkeleton = () => (
  <div
    className="min-h-screen bg-surface dark:bg-surface-foreground/5"
    data-testid="skeleton-loader"
  >
    <div className="h-screen bg-surface-foreground/10 dark:bg-surface/10 animate-pulse flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="h-4 w-32 bg-surface-foreground/20 dark:bg-surface/20 rounded mx-auto" />
        <div className="h-12 w-80 bg-surface-foreground/20 dark:bg-surface/20 rounded mx-auto" />
        <div className="h-4 w-48 bg-surface-foreground/20 dark:bg-surface/20 rounded mx-auto" />
      </div>
    </div>

    <div className="w-full px-4 sm:px-6 lg:px-10 py-16">
      <div className="bg-surface-foreground/5 rounded-2xl p-6 border border-border">
        <div className="h-8 w-40 bg-surface-foreground/20 dark:bg-surface/20 rounded mb-6 animate-pulse" />
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
  <div className="min-h-screen bg-surface dark:bg-surface-foreground/5">
    <div className="container mx-auto px-4 py-16">
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-danger mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-text dark:text-accent-foreground mb-2">
            Gallery Not Available
          </h1>
          <p className="text-muted dark:text-text">{error}</p>
        </div>
      </div>
    </div>
  </div>
);
