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

      <div className="bg-surface-1 dark:bg-surface-dark-1 rounded-xl p-6 space-y-4 border border-border/40">
        <div>
          <label htmlFor="email" className="flex items-center gap-2 text-sm font-medium text-text mb-2">
            <Mail className="w-4 h-4" />
            Email Address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            readOnly
            className="w-full px-4 py-2.5 border border-border/40 rounded-lg bg-surface/80 dark:bg-muted-dark/20 text-text/50 cursor-not-allowed focus:outline-none"
            title="Email cannot be changed"
          />
          <p className="text-xs text-muted/70 mt-1">Email address cannot be changed</p>
        </div>

        <div>
          <label
            htmlFor="displayName"
            className="flex items-center gap-2 text-sm font-medium text-text mb-2"
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
            className="w-full px-4 py-2.5 border border-border rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
          />
        </div>

        <div
          className="relative rounded-lg border border-border/40 bg-surface dark:bg-muted-dark/20 px-4 py-3 z-0"
          onMouseEnter={() => setShowStorageTooltip(true)}
          onMouseLeave={() => setShowStorageTooltip(false)}
        >
          {showStorageTooltip && (
            <div
              className="absolute left-1/2 -translate-x-1/2 -top-10 bg-surface dark:bg-surface-dark border border-border/40 text-text text-sm rounded-md px-3 py-1 shadow-sm z-10"
              role="status"
            >
              {`${formatMB(storageUsed)} / ${formatMB(storageQuota)} USED`}
            </div>
          )}
          <div className="flex items-center justify-between text-sm font-medium text-text">
            <span>Storage usage</span>
            <span>
              {formatBytes(storageUsed)} / {formatBytes(storageQuota)}
            </span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-border/40 dark:bg-border/20">
            <div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${storagePercent}%` }} />
          </div>
          <p className="mt-1 text-xs text-text/60 dark:text-muted">{storagePercent}% used</p>
        </div>

        <button
          onClick={onProfileSave}
          disabled={savingProfile}
          className="w-full px-4 py-2.5 bg-accent text-accent-foreground font-medium rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
        >
          {savingProfile ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
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
