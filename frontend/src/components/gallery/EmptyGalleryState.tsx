import { ImageOff } from 'lucide-react';

interface EmptyGalleryStateProps {
  onUploadClick: () => void;
}

export const EmptyGalleryState = ({ onUploadClick }: EmptyGalleryStateProps) => {
  return (
    <button
      type="button"
      onClick={onUploadClick}
      className="group flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface/30 px-6 py-16 text-center transition hover:border-accent hover:bg-linear-to-br hover:from-surface/70 hover:to-accent/10 focus-visible:border-accent dark:border-border/40 dark:bg-surface-dark/30 dark:hover:from-surface-dark/70 dark:hover:to-accent/10"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface/60 text-muted transition group-hover:border-accent group-hover:text-accent dark:border-border/30 dark:bg-surface-dark/50 dark:text-muted-dark">
        <ImageOff className="h-8 w-8" />
      </div>
      <h3 className="mt-4 text-lg font-medium text-muted transition group-hover:text-text dark:text-muted-dark">
        No photos in this gallery
      </h3>
      <p className="mt-2 text-sm text-muted transition group-hover:text-text/80">
        Upload your first photo to get started.
      </p>
      <span className="mt-3 text-xs font-semibold uppercase tracking-[0.3em] text-accent transition group-hover:text-accent-foreground">
        Click to add photos
      </span>
    </button>
  );
};
