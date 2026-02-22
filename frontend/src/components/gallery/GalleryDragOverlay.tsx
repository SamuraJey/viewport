interface GalleryDragOverlayProps {
    isActive: boolean;
}

export const GalleryDragOverlay = ({ isActive }: GalleryDragOverlayProps) => {
    if (!isActive) {
        return null;
    }

    return (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-[1px]">
            <div className="rounded-xl border border-accent/30 bg-surface/95 px-6 py-4 text-center shadow-xl dark:bg-surface-dark/95">
                <p className="text-base font-semibold text-text">Drop photos to upload</p>
                <p className="mt-1 text-sm text-muted">JPG / PNG · up to 15 MB</p>
            </div>
        </div>
    );
};
