/** A pending action stays cancellable without mounting a temporary focus trap. */
export const OverlayLoading = ({
  open,
  onClose,
  label,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
}) =>
  open ? (
    <div className="fixed bottom-6 left-1/2 z-100 flex -translate-x-1/2 items-center gap-4 rounded-xl border border-border bg-surface px-4 py-2 text-text shadow-xl dark:bg-surface-dark">
      <p role="status" aria-live="polite" className="text-sm">
        {label}…
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label={`Cancel ${label.toLowerCase()}`}
        className="min-h-11 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Cancel
      </button>
    </div>
  ) : null;
