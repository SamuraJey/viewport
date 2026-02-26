interface GalleryDragOverlayProps {
  isActive: boolean;
}

export const GalleryDragOverlay = ({ isActive }: GalleryDragOverlayProps) => {
  if (!isActive) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-all duration-300">
      <div className="rounded-2xl border border-accent/40 bg-surface/95 px-8 py-6 text-center shadow-2xl dark:bg-surface-dark/95 scale-105 transition-all duration-200">
        <p className="text-xl font-bold text-text">Drop photos to upload</p>
        <p className="mt-2 text-sm font-medium text-muted">JPG / PNG · up to 15 MB</p>
      </div>
    </div>
  );
};
