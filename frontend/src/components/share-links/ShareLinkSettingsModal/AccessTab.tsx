import { CalendarClock, LockKeyhole } from 'lucide-react';
import {
  TTL_OPTIONS,
  SHARE_LINK_PASSWORD_MIN_LENGTH,
  SHARE_LINK_PASSWORD_MAX_BYTES,
} from './constants';
import type { EditableShareLink, PasswordMode, ShareLinkSettingsMode, TtlPreset } from './types';

interface AccessTabProps {
  mode: ShareLinkSettingsMode;
  isActive: boolean;
  setIsActive: (value: boolean) => void;
  ttlPreset: TtlPreset;
  setTtlPreset: (value: TtlPreset) => void;
  customExpiresAt: string;
  setCustomExpiresAt: (value: string) => void;
  passwordMode: PasswordMode;
  setPasswordMode: (value: PasswordMode) => void;
  password: string;
  setPassword: (value: string) => void;
  link?: EditableShareLink | null;
  isSaving: boolean;
}

export const AccessTab = ({
  mode,
  isActive,
  setIsActive,
  ttlPreset,
  setTtlPreset,
  customExpiresAt,
  setCustomExpiresAt,
  passwordMode,
  setPasswordMode,
  password,
  setPassword,
  link,
  isSaving,
}: AccessTabProps) => (
  <div className="space-y-5">
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-text">Availability</h3>
        <p className="text-xs text-muted">Choose whether the public URL works immediately.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          {
            value: true,
            label: mode === 'create' ? 'Active on create' : 'Active',
            description: 'Visitors can open the link immediately.',
          },
          {
            value: false,
            label: mode === 'create' ? 'Create paused' : 'Paused',
            description: 'Public access stays hidden until you activate it.',
          },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => setIsActive(option.value)}
            disabled={isSaving}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              isActive === option.value
                ? 'border-accent bg-accent/10 text-text'
                : 'border-border/50 bg-surface-1 text-text hover:border-accent/40'
            }`}
          >
            <span className="block text-sm font-semibold">{option.label}</span>
            <span className="mt-1 block text-xs text-muted">{option.description}</span>
          </button>
        ))}
      </div>
    </section>

    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-text">Expiration</h3>
        <p className="text-xs text-muted">TTL is stored in UTC.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {TTL_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTtlPreset(option.value)}
            disabled={isSaving}
            className={`rounded-xl border px-3 py-3 text-left transition-colors ${
              ttlPreset === option.value
                ? 'border-accent bg-accent/10 text-text'
                : 'border-border/50 bg-surface-1 text-text hover:border-accent/40'
            }`}
          >
            <span className="block text-sm font-semibold">{option.label}</span>
            <span className="mt-1 block text-xs text-muted">{option.description}</span>
          </button>
        ))}
      </div>
      {ttlPreset === 'custom' ? (
        <div className="space-y-2">
          <label htmlFor="share-link-expiration" className="text-xs font-semibold text-text">
            Custom expiration
          </label>
          <div className="relative">
            <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="share-link-expiration"
              type="datetime-local"
              value={customExpiresAt}
              onChange={(event) => setCustomExpiresAt(event.target.value)}
              className="w-full rounded-xl border border-border/50 bg-surface-1 py-2.5 pl-9 pr-3 text-sm text-text outline-none transition-colors focus:border-accent dark:bg-surface-dark-1"
              disabled={isSaving}
            />
          </div>
        </div>
      ) : null}
    </section>

    <section className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
          <LockKeyhole className="h-4 w-4 text-accent" aria-hidden="true" />
          Password protection
        </h3>
        <p className="text-xs text-muted">
          Store only a hash; send the password to clients separately.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(mode === 'edit' && link?.has_password
          ? [
              {
                value: 'keep' as const,
                label: 'Keep current password',
                description: 'Do not change protection.',
              },
              {
                value: 'set' as const,
                label: 'Replace password',
                description: 'Set a new password.',
              },
              {
                value: 'clear' as const,
                label: 'Remove password',
                description: 'Make the link open without password.',
              },
            ]
          : [
              {
                value: 'none' as const,
                label: 'No password',
                description: 'Anyone with the link can open it.',
              },
              {
                value: 'set' as const,
                label: 'Require password',
                description: 'Clients must enter a password.',
              },
            ]
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setPasswordMode(option.value)}
            disabled={isSaving}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              passwordMode === option.value
                ? 'border-accent bg-accent/10 text-text'
                : 'border-border/50 bg-surface-1 text-text hover:border-accent/40'
            }`}
          >
            <span className="block text-sm font-semibold">{option.label}</span>
            <span className="mt-1 block text-xs text-muted">{option.description}</span>
          </button>
        ))}
      </div>
      {passwordMode === 'set' ? (
        <label className="block space-y-1.5 text-sm">
          <span className="font-semibold text-text">New share password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={SHARE_LINK_PASSWORD_MIN_LENGTH}
            maxLength={SHARE_LINK_PASSWORD_MAX_BYTES}
            autoComplete="new-password"
            className="w-full rounded-xl border border-border/50 bg-surface-1 px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent dark:bg-surface-dark-1"
            disabled={isSaving}
          />
          <span className="block text-xs text-muted">
            Use at least 8 characters and at most 72 UTF-8 bytes. The password cannot be recovered
            later.
          </span>
        </label>
      ) : null}
    </section>
  </div>
);
