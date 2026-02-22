import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Check, Edit3, Trash2, X } from 'lucide-react';
import { formatDateOnly } from '../../lib/utils';
import type { Gallery } from '../../services/galleryService';

interface DashboardGalleryCardProps {
  gallery: Gallery;
  isRenamingThis: boolean;
  renameInput: string;
  isRenaming: boolean;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  onRenameInputChange: (value: string) => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  onBeginRename: (gallery: Gallery) => void;
  onDelete: (gallery: Gallery) => void;
  variants: {
    hidden: { opacity: number; y: number; scale: number };
    visible: {
      opacity: number;
      y: number;
      scale: number;
      transition: { type: 'spring'; stiffness: number; damping: number };
    };
    exit: { opacity: number; scale: number; y: number; transition: { duration: number } };
  };
}

export const DashboardGalleryCard = ({
  gallery,
  isRenamingThis,
  renameInput,
  isRenaming,
  renameInputRef,
  onRenameInputChange,
  onConfirmRename,
  onCancelRename,
  onBeginRename,
  onDelete,
  variants,
}: DashboardGalleryCardProps) => {
  return (
    <motion.div
      key={gallery.id}
      variants={variants}
      layout
      exit="exit"
      className="bg-surface dark:bg-surface-foreground/95 backdrop-blur-lg rounded-2xl p-8 border border-border dark:border-border/10 hover:transform hover:scale-101 hover:shadow-2xl "
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="bg-accent/20 p-2 rounded-lg shrink-0 border border-accent/10">
            <Calendar className="h-6 w-6 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            {isRenamingThis ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={renameInputRef}
                  className="flex-1 px-3 py-2 border-2 border-accent/50 dark:border-accent/40 rounded-lg min-w-0 text-base bg-surface-1 dark:bg-surface-dark-1 text-text dark:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent shadow-sm hover:border-accent/70 transition-all duration-200"
                  value={renameInput}
                  onChange={(event) => onRenameInputChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onConfirmRename();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      onCancelRename();
                    }
                  }}
                  placeholder="Gallery name..."
                  aria-label="Rename gallery input"
                />
                <button
                  onClick={onConfirmRename}
                  disabled={isRenaming || !renameInput.trim()}
                  title="Save (Enter)"
                  aria-label="Confirm rename"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-500/90 hover:bg-green-500 border border-green-600/50 text-white shadow-sm hover:shadow-md transition-all duration-200 hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {isRenaming ? (
                    <div className="w-4 h-4 border-2 border-border/20 border-t-accent rounded-full animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={onCancelRename}
                  title="Cancel (Esc)"
                  aria-label="Cancel rename"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger/20 hover:bg-danger/30 border border-danger/40 text-danger transition-all duration-200 hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <h3 className="font-oswald text-base font-bold uppercase tracking-wide text-text wrap-break-word">
                  {gallery.name || `Gallery #${gallery.id}`}
                </h3>
                <p className="text-muted text-sm font-cuprum">
                  {formatDateOnly(gallery.shooting_date || gallery.created_at)}
                </p>
              </>
            )}
          </div>
        </div>
        {!isRenamingThis && (
          <div className="flex gap-2">
            <button
              onClick={() => onBeginRename(gallery)}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/20 hover:bg-accent/30 border border-accent/40 text-accent shadow-sm hover:shadow-md hover:scale-110 transition-all duration-200 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              title="Rename Gallery"
              aria-label={`Rename ${gallery.name || `Gallery #${gallery.id}`}`}
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(gallery)}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-danger/20 hover:bg-danger/30 border border-danger/40 text-danger shadow-sm hover:shadow-md hover:scale-110 transition-all duration-200 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
              title="Delete Gallery"
              aria-label={`Delete ${gallery.name || `Gallery #${gallery.id}`}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      <div>
        <Link
          to={`/galleries/${gallery.id}`}
          className="block w-full bg-accent text-accent-foreground font-semibold py-3 px-6 rounded-lg text-center hover:scale-105 active:scale-95 hover:shadow-lg shadow-sm border border-accent/20 no-underline transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          aria-label={`Manage ${gallery.name || `Gallery #${gallery.id}`}`}
        >
          Manage Gallery
        </Link>
      </div>
    </motion.div>
  );
};
