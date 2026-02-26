import type { RefObject } from 'react';
import { CheckCircle2, Loader2, Lock, Mail, Save, User } from 'lucide-react';

const DISPLAY_NAME_MAX = 48;

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
};

interface ProfileInfoSectionProps {
  email: string;
  displayName: string;
  storageUsed: number;
  storageQuota: number;
  storagePercent: number;
  /** @deprecated kept for API compatibility — tooltip is now always inline */
  showStorageTooltip: boolean;
  savingProfile: boolean;
  firstFieldRef: RefObject<HTMLInputElement | null>;
  setDisplayName: (value: string) => void;
  /** @deprecated kept for API compatibility */
  setShowStorageTooltip: (show: boolean) => void;
  onProfileSave: () => void;
}

export const ProfileInfoSection = ({
  email,
  displayName,
  storageUsed,
  storageQuota,
  storagePercent,
  savingProfile,
  firstFieldRef,
  setDisplayName,
  onProfileSave,
}: ProfileInfoSectionProps) => {
  const charsLeft = DISPLAY_NAME_MAX - displayName.length;
  const isNearLimit = charsLeft <= 10;
  const isAtLimit = charsLeft <= 0;

  // Dynamic storage bar color
  const barColor =
    storagePercent >= 90 ? 'bg-danger' : storagePercent >= 70 ? 'bg-amber-500' : 'bg-accent';
  const storageLabelColor =
    storagePercent >= 90 ? 'text-danger' : storagePercent >= 70 ? 'text-amber-500' : 'text-muted';

  return (
    <div className="space-y-5">
      {/* Email — read-only */}
      <div>
        <label
          htmlFor="email"
          className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted mb-2"
        >
          <Mail className="h-3.5 w-3.5" />
          Email address
        </label>
        <div className="relative">
          <input
            id="email"
            type="email"
            value={email}
            readOnly
            aria-readonly="true"
            tabIndex={-1}
            className="w-full cursor-not-allowed rounded-xl border border-border/40 bg-surface-1/60 px-4 py-3 pr-10 text-sm text-muted dark:bg-surface-dark-1/40 focus:outline-hidden"
          />
          <Lock
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-border"
            aria-hidden="true"
          />
        </div>
        <p className="mt-1.5 text-xs text-muted/60">Email cannot be changed after registration.</p>
      </div>

      {/* Display name */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label
            htmlFor="displayName"
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted"
          >
            <User className="h-3.5 w-3.5" />
            Display name
          </label>
          <span
            className={`text-xs font-semibold tabular-nums ${isAtLimit ? 'text-danger' : isNearLimit ? 'text-amber-500' : 'text-muted/50'
              }`}
            aria-live="polite"
          >
            {charsLeft}
          </span>
        </div>
        <input
          id="displayName"
          type="text"
          ref={firstFieldRef}
          value={displayName}
          maxLength={DISPLAY_NAME_MAX}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Enter your display name"
          autoComplete="name"
          className="w-full rounded-xl border border-border bg-transparent px-4 py-3 text-sm transition-all focus:border-transparent focus:outline-hidden focus:ring-2 focus:ring-accent"
        />
      </div>

      {/* Storage */}
      <div className="rounded-xl border border-border/40 bg-surface-1/50 px-5 py-4 dark:bg-surface-dark-1/40">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-text">Storage</span>
          <span className={`text-xs font-bold tabular-nums ${storageLabelColor}`}>
            {formatBytes(storageUsed)}
            <span className="font-normal text-muted"> / {formatBytes(storageQuota)}</span>
          </span>
        </div>
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-border/30 dark:bg-border/20"
          role="progressbar"
          aria-valuenow={storagePercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${storagePercent}% storage used`}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
            style={{ width: `${Math.min(storagePercent, 100)}%` }}
          />
        </div>
        <p className={`mt-2 text-xs font-medium ${storageLabelColor}`}>
          {storagePercent >= 90
            ? `Critical — ${storagePercent}% used`
            : storagePercent >= 70
              ? `Getting full — ${storagePercent}% used`
              : `${storagePercent}% used`}
        </p>
      </div>

      {/* Save */}
      <button
        onClick={onProfileSave}
        disabled={savingProfile || displayName.trim().length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        {savingProfile ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving…
          </>
        ) : (
          <>
            <Save className="h-4 w-4" />
            Save Profile
            {displayName.trim().length > 0 && <CheckCircle2 className="h-4 w-4 opacity-60" />}
          </>
        )}
      </button>
    </div>
  );
};
