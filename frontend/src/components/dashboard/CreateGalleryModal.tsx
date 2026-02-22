import { motion } from 'framer-motion';

interface CreateGalleryModalProps {
  isOpen: boolean;
  isCreating: boolean;
  newGalleryName: string;
  shootingDate: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onConfirm: () => void;
  onNameChange: (value: string) => void;
  onShootingDateChange: (value: string) => void;
}

export const CreateGalleryModal = ({
  isOpen,
  isCreating,
  newGalleryName,
  shootingDate,
  inputRef,
  onClose,
  onConfirm,
  onNameChange,
  onShootingDateChange,
}: CreateGalleryModalProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div
        className="relative bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-border dark:border-border/20"
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 24 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="modal-title" className="font-oswald text-xl font-bold uppercase tracking-wide mb-1 text-text">
          New Gallery
        </h2>
        <p className="text-muted text-sm mb-5">Enter a name for your new gallery.</p>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="gallery-name-input"
              className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1.5"
            >
              Gallery name
            </label>
            <input
              id="gallery-name-input"
              ref={inputRef}
              type="text"
              value={newGalleryName}
              onChange={(event) => onNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onConfirm();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  onClose();
                }
              }}
              className="w-full px-4 py-3 border-2 border-border dark:border-border/40 rounded-xl focus:outline-none focus:ring-0 focus:border-accent hover:border-accent/60 bg-surface-1 dark:bg-surface-dark-1 text-text transition-all duration-200"
              placeholder="Gallery name"
            />
          </div>
          <div>
            <label
              className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1.5"
              htmlFor="shooting-date-input"
            >
              Shooting date
            </label>
            <input
              id="shooting-date-input"
              type="date"
              value={shootingDate}
              onChange={(event) => onShootingDateChange(event.target.value)}
              className="w-full px-4 py-3 border-2 border-border dark:border-border/40 rounded-xl focus:outline-none focus:ring-0 focus:border-accent hover:border-accent/60 bg-surface-1 dark:bg-surface-dark-1 text-text transition-all duration-200"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-surface-1 dark:bg-surface-dark-1 rounded-xl text-text hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-border dark:border-border/40 shadow-sm hover:shadow-md transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isCreating || !newGalleryName.trim()}
            className="px-4 py-2.5 bg-accent text-accent-foreground rounded-xl shadow-sm hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-sm"
          >
            {isCreating ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              'Create Gallery'
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
