import type { RefObject } from 'react';
import { Loader2, Mail, User, UserCircle } from 'lucide-react';

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
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

const formatMB = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0.00 MB';
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(2)} MB`;
};

interface ProfileInfoSectionProps {
  email: string;
  displayName: string;
  storageUsed: number;
  storageQuota: number;
  storagePercent: number;
  showStorageTooltip: boolean;
  savingProfile: boolean;
  firstFieldRef: RefObject<HTMLInputElement | null>;
  setDisplayName: (value: string) => void;
  setShowStorageTooltip: (show: boolean) => void;
  onProfileSave: () => void;
}

export const ProfileInfoSection = ({
  email,
  displayName,
  storageUsed,
  storageQuota,
  storagePercent,
  showStorageTooltip,
  savingProfile,
  firstFieldRef,
  setDisplayName,
  setShowStorageTooltip,
  onProfileSave,
}: ProfileInfoSectionProps) => {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <UserCircle className="w-5 h-5 text-accent" />
        <h3 className="text-lg font-semibold text-text">Profile Information</h3>
      </div>

      <div className="bg-surface-1 dark:bg-surface-dark-1 rounded-2xl p-6 space-y-5 border border-border/40 shadow-xs">
        <div>
          <label
            htmlFor="email"
            className="flex items-center gap-2 text-sm font-semibold text-text mb-2"
          >
            <Mail className="w-4 h-4" />
            Email Address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            readOnly
            className="w-full px-4 py-3 border border-border/40 rounded-xl bg-surface/80 dark:bg-muted-dark/20 text-text/50 cursor-not-allowed focus:outline-hidden"
            title="Email cannot be changed"
          />
          <p className="text-xs text-muted/70 mt-1.5 font-medium">
            Email address cannot be changed
          </p>
        </div>

        <div>
          <label
            htmlFor="displayName"
            className="flex items-center gap-2 text-sm font-semibold text-text mb-2"
          >
            <User className="w-4 h-4" />
            Display Name
          </label>
          <input
            id="displayName"
            type="text"
            ref={firstFieldRef}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Enter your display name"
            className="w-full px-4 py-3 border border-border rounded-xl bg-transparent focus:outline-hidden focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
          />
        </div>

        <div
          className="relative rounded-xl border border-border/40 bg-surface dark:bg-muted-dark/20 px-5 py-4 z-0"
          onMouseEnter={() => setShowStorageTooltip(true)}
          onMouseLeave={() => setShowStorageTooltip(false)}
        >
          {showStorageTooltip && (
            <div
              className="absolute left-1/2 -translate-x-1/2 -top-10 bg-surface dark:bg-surface-dark border border-border/40 text-text text-sm rounded-lg px-3 py-1.5 shadow-md z-10 font-medium"
              role="status"
            >
              {`${formatMB(storageUsed)} / ${formatMB(storageQuota)} USED`}
            </div>
          )}
          <div className="flex items-center justify-between text-sm font-semibold text-text">
            <span>Storage usage</span>
            <span>
              {formatBytes(storageUsed)} / {formatBytes(storageQuota)}
            </span>
          </div>
          <div className="mt-3 h-2.5 w-full rounded-full bg-border/40 dark:bg-border/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
              style={{ width: `${storagePercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-medium text-text/60 dark:text-muted">
            {storagePercent}% used
          </p>
        </div>

        <button
          onClick={onProfileSave}
          disabled={savingProfile}
          className="w-full px-4 py-3 bg-accent text-accent-foreground font-semibold rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {savingProfile ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Profile'
          )}
        </button>
      </div>
    </section>
  );
};
