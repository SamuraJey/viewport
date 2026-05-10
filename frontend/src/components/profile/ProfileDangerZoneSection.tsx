import { AlertTriangle, LogOut, Trash2 } from 'lucide-react';

interface ProfileDangerZoneSectionProps {
  onLogout: () => void;
}

export const ProfileDangerZoneSection = ({ onLogout }: ProfileDangerZoneSectionProps) => (
  <div className="space-y-4">
    <div className="rounded-xl border border-border/50 bg-surface-1/60 p-4 dark:bg-surface-dark-1/40">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">Sign out</p>
          <p className="mt-0.5 text-xs text-muted">End your current session on this device.</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-2 active:translate-y-0 dark:bg-surface-dark dark:hover:bg-surface-dark-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </div>

    <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            <p className="text-sm font-semibold text-danger">Delete account</p>
          </div>
          <p id="account-delete-unavailable-description" className="mt-1 text-xs text-muted">
            Account deletion is not available in this build yet. Contact an administrator if you
            need your account and data removed.
          </p>
        </div>
        <button
          type="button"
          disabled
          aria-describedby="account-delete-unavailable-description"
          className="flex shrink-0 cursor-not-allowed items-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          Unavailable
        </button>
      </div>
    </div>
  </div>
);
