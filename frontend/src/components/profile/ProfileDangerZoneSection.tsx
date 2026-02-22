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
      <section className="space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-danger" />
          <h3 className="text-lg font-semibold text-text">Danger Zone</h3>
        </div>

        <div className="bg-danger/5 border border-danger/20 rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={onLogout}
              className="px-4 py-2.5 bg-surface-1 dark:bg-surface-dark-1 border border-border hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-text font-medium rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>

            <button
              onClick={onStartDelete}
              className="px-4 py-2.5 bg-danger hover:bg-danger/90 text-white font-medium rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete Account
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (deleteStep === 'password') {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-danger" />
          <h3 className="text-lg font-semibold text-danger">Confirm Account Deletion</h3>
        </div>

        <div className="bg-danger/10 border border-danger/20 rounded-xl p-6 space-y-4">
          <p className="text-text">
            Please enter your current password to proceed with account deletion.
          </p>

          <div className="relative">
            <input
              type={showDeletePassword ? 'text' : 'password'}
              placeholder="Current Password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              className="w-full px-4 py-2.5 pr-12 border border-danger/30 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-danger focus:border-transparent transition-all"
            />
            <button
              type="button"
              onClick={() => setShowDeletePassword(!showDeletePassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded transition-all duration-200 hover:scale-110"
            >
              {showDeletePassword ? (
                <EyeOff className="h-5 w-5 text-muted" />
              ) : (
                <Eye className="h-5 w-5 text-muted" />
              )}
            </button>
          </div>

          {deleteError && <p className="text-danger text-sm">{deleteError}</p>}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onCancelDelete}
              className="flex-1 px-4 py-2.5 bg-surface-1 dark:bg-surface-dark-1 border border-border hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-text font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
            >
              Cancel
            </button>
            <button
              onClick={onVerifyDeletePassword}
              disabled={!deletePassword}
              className="flex-1 px-4 py-2.5 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <AlertTriangle className="w-5 h-5 text-danger" />
        <h3 className="text-lg font-semibold text-danger">Final Confirmation</h3>
      </div>

      <div className="bg-danger/10 border border-danger/20 rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-danger shrink-0 mt-1" />
          <div>
            <p className="text-danger font-bold text-lg mb-2">This action cannot be undone!</p>
            <p className="text-text">Deleting your account will permanently remove:</p>
            <ul className="list-disc list-inside text-muted mt-2 space-y-1">
              <li>All your galleries</li>
              <li>All your photos</li>
              <li>All share links</li>
              <li>Your account data</li>
            </ul>
          </div>
        </div>

        {deleteError && <p className="text-danger text-sm">{deleteError}</p>}

        <div className="flex gap-3 pt-2">
          <button
            onClick={onCancelDelete}
            className="flex-1 px-4 py-2.5 bg-surface-1 dark:bg-surface-dark-1 border border-border hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-text font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirmDelete}
            disabled={deletingAccount}
            className="flex-1 px-4 py-2.5 bg-danger hover:bg-danger/90 text-white font-bold rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
          >
            {deletingAccount ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Yes, Delete My Account
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
};
