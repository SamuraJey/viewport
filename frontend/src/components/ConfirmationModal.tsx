import React from 'react';
import { X, AlertTriangle, Check } from 'lucide-react';
import { AppDialog, AppDialogDescription, AppDialogTitle } from './ui';

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = React.memo(
  ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isDangerous = false,
  }) => {
    const [isLoading, setIsLoading] = React.useState(false);
    const cancelButtonRef = React.useRef<HTMLButtonElement>(null);
    const handleClose = () => {
      if (!isLoading) {
        onClose();
      }
    };

    const handleConfirm = async () => {
      setIsLoading(true);
      try {
        await onConfirm();
        onClose();
      } catch (error) {
        console.error('Confirmation action failed:', error);
        // Ideally we would show an error here, but for now we rely on the parent to handle errors or we could add error state here
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <AppDialog
        open={isOpen}
        onClose={handleClose}
        canClose={!isLoading}
        initialFocusRef={cancelButtonRef}
        panelClassName="bg-surface dark:bg-surface-foreground rounded-2xl shadow-2xl w-full max-w-md border border-border dark:border-border/20 overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 border-b border-border dark:border-border">
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-xl ${isDangerous ? 'bg-red-100 dark:bg-red-900/50' : 'bg-blue-100 dark:bg-blue-900/50'}`}
            >
              <AlertTriangle
                className={`w-5 h-5 ${isDangerous ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}
              />
            </div>
            <AppDialogTitle className="font-oswald text-lg font-bold uppercase tracking-wide text-text dark:text-white">
              {title}
            </AppDialogTitle>
          </div>
          <button
            onClick={handleClose}
            disabled={isLoading}
            aria-label="Close confirmation dialog"
            className="p-1.5 text-muted hover:text-text dark:hover:text-text rounded-lg hover:bg-surface-1 dark:hover:bg-surface-dark-1 transition-all duration-200 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          <AppDialogDescription className="text-text dark:text-text leading-relaxed">
            {message}
          </AppDialogDescription>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-surface-1/50 dark:bg-surface-dark-1/50">
          <button
            ref={cancelButtonRef}
            onClick={onClose}
            disabled={isLoading}
            className="px-5 py-2.5 text-text dark:text-text bg-surface-1 dark:bg-surface-dark-1 hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded-xl border border-border dark:border-border/40 shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 font-medium"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`flex items-center gap-2 px-5 py-2.5 text-white rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none disabled:opacity-60 font-medium ${
              isDangerous
                ? 'bg-red-500 hover:bg-red-600 disabled:bg-red-400'
                : 'bg-accent hover:bg-accent/90 disabled:bg-accent/60'
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {isDangerous && <AlertTriangle className="w-4 h-4" />}
                {!isDangerous && <Check className="w-4 h-4" />}
                {confirmText}
              </>
            )}
          </button>
        </div>
      </AppDialog>
    );
  },
);

ConfirmationModal.displayName = 'ConfirmationModal';
