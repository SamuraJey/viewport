import { ImagePlus, Upload, MousePointerClick } from 'lucide-react';

interface EmptyGalleryStateProps {
  onUploadClick: () => void;
}

export const EmptyGalleryState = ({ onUploadClick }: EmptyGalleryStateProps) => {
  return (
    <div className="flex w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border/50 bg-linear-to-br from-surface-1/80 via-surface/60 to-surface-1/80 px-6 py-24 text-center dark:border-border/30 dark:from-surface-dark-1/50 dark:via-surface-dark/40 dark:to-surface-dark-1/50">
      {/* Animated icon */}
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-accent/20 blur-2xl animate-pulse" />
        <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-2 border-border/40 bg-surface shadow-lg dark:border-border/30 dark:bg-surface-dark-1">
          <div className="absolute inset-0 rounded-full bg-linear-to-br from-accent/5 to-transparent" />
          <ImagePlus className="h-14 w-14 text-accent" />
        </div>
      </div>

      {/* Main message */}
      <h3 className="mt-8 text-3xl font-bold text-text">Your gallery is empty</h3>
      <p className="mt-4 max-w-lg text-base font-medium text-muted leading-relaxed">
        Start building your collection by uploading photos. Your memories deserve a beautiful home.
      </p>

      {/* Action button */}
      <button
        type="button"
        onClick={onUploadClick}
        className="group mt-10 inline-flex items-center gap-3 rounded-xl bg-accent px-8 py-4 text-base font-bold text-accent-foreground shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl hover:-translate-y-1 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-surface active:translate-y-0"
      >
        <Upload className="h-5 w-5" />
        Upload Photos
        <span className="ml-1 text-xs opacity-80">(or drag & drop)</span>
      </button>

      {/* Tips */}
      <div className="mt-12 grid gap-4 sm:grid-cols-2 max-w-2xl">
        <div className="flex items-start gap-3 rounded-xl border border-border/40 bg-surface/50 p-4 text-left dark:border-border/30 dark:bg-surface-dark-1/50">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <MousePointerClick className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Click to upload</p>
            <p className="mt-1 text-xs text-muted leading-relaxed">
              Choose single or multiple photos from your device
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-border/40 bg-surface/50 p-4 text-left dark:border-border/30 dark:bg-surface-dark-1/50">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Upload className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Drag & drop</p>
            <p className="mt-1 text-xs text-muted leading-relaxed">
              Drop photos anywhere on this page to upload
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
