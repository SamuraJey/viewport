import { CheckSquare, Square, Search, Star, StarOff, Pencil, Download, Trash2 } from 'lucide-react';
import type { PhotoResponse } from '../../services/photoService';

interface PhotoCardProps {
  photo: PhotoResponse;
  index: number;
  isSelectionMode: boolean;
  isSelected: boolean;
  isCover: boolean;
  onToggleSelection: (photoId: string, isShiftKey: boolean) => void;
  onOpenPhoto: (index: number) => void;
  onSetCover: (photoId: string) => void;
  onClearCover: () => void;
  onRenamePhoto: (photoId: string, filename: string) => void;
  onDeletePhoto: (photoId: string) => void;
}

export const PhotoCard = ({
  photo,
  index,
  isSelectionMode,
  isSelected,
  isCover,
  onToggleSelection,
  onOpenPhoto,
  onSetCover,
  onClearCover,
  onRenamePhoto,
  onDeletePhoto,
}: PhotoCardProps) => {
  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(photo.url);
      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = photo.filename;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download photo:', error);
    }
  };

  return (
    <div
      data-photo-card
      className="group bg-surface dark:bg-surface-dark-1 flex flex-col relative overflow-visible rounded-lg border border-border dark:border-border/50 shadow-md transition-shadow duration-200 hover:shadow-2xl focus-within:shadow-2xl dark:shadow-none dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_18px_rgba(255,255,255,0.35)] dark:focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_18px_rgba(255,255,255,0.35)]"
    >
      {/* Selection checkbox */}
      {isSelectionMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelection(photo.id, e.shiftKey);
          }}
          className={`absolute top-2 left-2 z-10 p-2 rounded-lg transition-colors duration-200 ${
            isSelected
              ? 'bg-blue-500 text-white shadow-md'
              : 'bg-white/95 dark:bg-black/60 text-gray-800 dark:text-gray-200 hover:bg-white dark:hover:bg-black/80 shadow-sm hover:shadow-md'
          }`}
          title={isSelected ? 'Deselect' : 'Select'}
        >
          {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
        </button>
      )}

      {/* Image area */}
      <div className="relative h-80">
        {/* Action Panel - floating pop-up above container */}
        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 z-20 popup-container opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {/* Pop-up arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent popup-arrow"></div>

          <div className="flex items-center justify-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenPhoto(index);
              }}
              className="popup-action popup-action--accent"
              title="Open photo"
              aria-label="Open photo"
            >
              <Search className="h-4 w-4" />
            </button>
            {isCover ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClearCover();
                }}
                className="popup-action popup-action--warning"
                title="Remove cover"
                aria-label="Remove cover"
              >
                <StarOff className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSetCover(photo.id);
                }}
                className="popup-action popup-action--warning"
                title="Set as cover"
                aria-label="Set as cover"
              >
                <Star className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRenamePhoto(photo.id, photo.filename);
              }}
              className="popup-action popup-action--accent"
              title="Rename photo"
              aria-label="Rename photo"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={handleDownload}
              className="popup-action popup-action--success"
              title="Download photo"
              aria-label="Download photo"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeletePhoto(photo.id);
              }}
              className="popup-action popup-action--danger"
              title="Delete photo"
              aria-label="Delete photo"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Photo - takes full image area */}
        <button
          onClick={() => onOpenPhoto(index)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onRenamePhoto(photo.id, photo.filename);
          }}
          className="w-full h-full p-0 border-0 bg-transparent cursor-pointer absolute inset-0"
          aria-label={`Photo ${photo.id}`}
          title="Click to view, double-click to rename"
        >
          <img
            src={photo.thumbnail_url}
            alt={`Photo ${photo.id}`}
            crossOrigin="anonymous"
            className="w-full h-full object-contain rounded-t-lg transition-opacity"
            loading="lazy"
          />
        </button>
      </div>

      {/* Caption below the image (not overlapping) */}
      <div className="px-2 py-2">
        <p className="text-xs text-muted truncate text-center" title={photo.filename}>
          {photo.filename}
        </p>
      </div>
    </div>
  );
};
