import { ImageOff } from 'lucide-react';

interface EmptyGalleryStateProps {
  onUploadClick: () => void;
}

export const EmptyGalleryState = ({ onUploadClick }: EmptyGalleryStateProps) => {
  return (
    <button
      type="button"
      onClick={onUploadClick}
      className="group flex w-full cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border/50 bg-surface-1/50 px-6 py-24 text-center transition-all duration-300 hover:border-accent/50 hover:bg-accent/5 focus:outline-hidden focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:border-border/30 dark:bg-surface-dark-1/50"
    >
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-surface border border-border/50 text-muted shadow-xs transition-all duration-300 group-hover:scale-110 group-hover:border-accent/30 group-hover:text-accent group-hover:bg-accent/10 dark:bg-surface-dark-2 dark:text-muted-dark">
        <ImageOff className="h-12 w-12" />
      </div>
      <h3 className="mt-8 text-2xl font-bold text-text transition-colors group-hover:text-accent">
        No photos in this gallery
      </h3>
      <p className="mt-3 text-base font-medium text-muted max-w-md">
        Upload your first photo to get started. You can also drag and drop files anywhere on this
        page.
      </p>
      <span className="mt-8 inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-accent-foreground shadow-sm transition-all group-hover:shadow-md group-hover:-translate-y-0.5">
        Click to add photos
      </span>
    </button>
  );
};
