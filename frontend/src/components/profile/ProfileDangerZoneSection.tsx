import { AlertTriangle, Eye, EyeOff, Loader2, LogOut, Trash2 } from 'lucide-react';

type DeleteStep = 'initial' | 'password' | 'confirm';

interface ProfileDangerZoneSectionProps {
  deleteStep: DeleteStep;
  deletePassword: string;
  showDeletePassword: boolean;
  deleteError: string | null;
  deletingAccount: boolean;
  onLogout: () => void;
  onStartDelete: () => void;
  onCancelDelete: () => void;
  onVerifyDeletePassword: () => void;
  onConfirmDelete: () => void;
  setDeletePassword: (value: string) => void;
  setShowDeletePassword: (value: boolean) => void;
}

const StepIndicator = ({ current, total }: { current: number; total: number }) => (
  <div className="flex items-center gap-1.5" aria-label={`Step ${current} of ${total}`}>
    {Array.from({ length: total }, (_, i) => (
      <div
        key={i}
        className={`h-1.5 rounded-full transition-all duration-300 ${i < current ? 'w-6 bg-danger' : i === current ? 'w-4 bg-danger/60' : 'w-4 bg-border/40'
          }`}
      />
    ))}
    <span className="ml-1 text-xs font-semibold text-muted">
      {current}/{total}
    </span>
  </div>
);

export const ProfileDangerZoneSection = ({
  deleteStep,
  deletePassword,
  showDeletePassword,
  deleteError,
  deletingAccount,
  onLogout,
  onStartDelete,
  onCancelDelete,
  onVerifyDeletePassword,
  onConfirmDelete,
  setDeletePassword,
  setShowDeletePassword,
}: ProfileDangerZoneSectionProps) => {
  if (deleteStep === 'initial') {
    return (
      <div className="space-y-4">
        {/* Logout — neutral action */}
        <div className="rounded-xl border border-border/50 bg-surface-1/60 p-4 dark:bg-surface-dark-1/40">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">Sign out</p>
              <p className="mt-0.5 text-xs text-muted">End your current session on this device.</p>
            </div>
            <button
              onClick={onLogout}
              className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-2 active:translate-y-0 dark:bg-surface-dark dark:hover:bg-surface-dark-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>

        {/* Delete — destructive action */}
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-danger">Delete account</p>
              <p className="mt-0.5 text-xs text-muted">
                Permanently remove your account and all data.
              </p>
            </div>
            <button
              onClick={onStartDelete}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-danger/90 active:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (deleteStep === 'password') {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-danger" />
            <h3 className="text-sm font-bold text-danger">Verify identity</h3>
          </div>
          <StepIndicator current={1} total={2} />
        </div>

        <p className="text-sm font-medium text-text">
          Enter your current password to continue with account deletion.
        </p>

        <div className="space-y-3 rounded-xl border border-danger/20 bg-danger/5 p-4">
          <div className="relative group">
            <label
              htmlFor="deletePassword"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted"
            >
              Current password
            </label>
            <div className="relative">
              <input
                id="deletePassword"
                type={showDeletePassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-xl border border-danger/30 bg-transparent px-4 py-3 pr-12 text-sm transition-all focus:border-transparent focus:outline-hidden focus:ring-2 focus:ring-danger"
              />
              <button
                type="button"
                aria-label={showDeletePassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowDeletePassword(!showDeletePassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted transition-all hover:bg-surface-2 hover:text-text hover:scale-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger dark:hover:bg-surface-dark-2"
              >
                {showDeletePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {deleteError && (
              <p className="mt-1.5 text-xs font-semibold text-danger" role="alert">
                {deleteError}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancelDelete}
            className="flex-1 rounded-xl border border-border bg-surface-1 px-4 py-2.5 text-sm font-semibold text-text transition-all duration-200 hover:bg-surface-2 dark:bg-surface-dark-1 dark:hover:bg-surface-dark-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Cancel
          </button>
          <button
            onClick={onVerifyDeletePassword}
            disabled={!deletePassword}
            className="flex-1 rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Continue →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-danger" />
          <h3 className="text-sm font-bold text-danger">Final confirmation</h3>
        </div>
        <StepIndicator current={2} total={2} />
      </div>

      <div className="rounded-xl border border-danger/30 bg-danger/10 p-4">
        <p className="mb-3 font-bold text-danger">This cannot be undone!</p>
        <p className="mb-2 text-sm font-medium text-text">Permanently deleted:</p>
        <ul className="space-y-1 text-sm text-muted">
          {['All galleries', 'All photos', 'All share links', 'Account data'].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-danger/60 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {deleteError && (
        <p className="text-sm font-semibold text-danger" role="alert">
          {deleteError}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={onCancelDelete}
          className="flex-1 rounded-xl border border-border bg-surface-1 px-4 py-2.5 text-sm font-semibold text-text transition-all duration-200 hover:bg-surface-2 dark:bg-surface-dark-1 dark:hover:bg-surface-dark-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Cancel
        </button>
        <button
          onClick={onConfirmDelete}
          disabled={deletingAccount}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {deletingAccount ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Deleting…
            </>
          ) : (
            <>
              <Trash2 className="h-4 w-4" />
              Delete My Account
            </>
          )}
        </button>
      </div>
    </div>
  );
};
