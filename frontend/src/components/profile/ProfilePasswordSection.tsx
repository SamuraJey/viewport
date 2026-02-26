import type { RefObject } from 'react';
import { Eye, EyeOff, Key, Loader2, ShieldCheck } from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────────────────

function getStrength(pwd: string): { score: number; label: string; color: string } {
  if (!pwd) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
  const colors = ['', 'bg-danger', 'bg-amber-500', 'bg-yellow-400', 'bg-accent', 'bg-success'];
  const textColors = [
    '',
    'text-danger',
    'text-amber-500',
    'text-yellow-500',
    'text-accent',
    'text-success',
  ];
  return {
    score,
    label: labels[score] ?? '',
    color: colors[score] ?? '' + ' ' + (textColors[score] ?? ''),
  };
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  show: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  hint?: string;
  onChange: (value: string) => void;
  onToggleShow: () => void;
}

const PasswordField = ({
  id,
  label,
  value,
  placeholder,
  show,
  inputRef,
  hint,
  onChange,
  onToggleShow,
}: PasswordFieldProps) => (
  <div>
    <label
      htmlFor={id}
      className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted"
    >
      {label}
    </label>
    <div className="relative group">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={id === 'currentPassword' ? 'current-password' : 'new-password'}
        className="w-full rounded-xl border border-border bg-transparent px-4 py-3 pr-12 text-sm transition-all focus:border-transparent focus:outline-hidden focus:ring-2 focus:ring-accent"
      />
      <button
        type="button"
        aria-label={show ? 'Hide password' : 'Show password'}
        onClick={onToggleShow}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted transition-all duration-200 hover:bg-surface-2 hover:text-text hover:scale-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent dark:hover:bg-surface-dark-2"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
    {hint && <p className="mt-1.5 text-xs text-muted/70">{hint}</p>}
  </div>
);

interface ProfilePasswordSectionProps {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  showCurrentPassword: boolean;
  showNewPassword: boolean;
  showConfirmPassword: boolean;
  changingPassword: boolean;
  confirmPassRef: RefObject<HTMLInputElement | null>;
  setCurrentPassword: (value: string) => void;
  setNewPassword: (value: string) => void;
  setConfirmPassword: (value: string) => void;
  setShowCurrentPassword: (value: boolean) => void;
  setShowNewPassword: (value: boolean) => void;
  setShowConfirmPassword: (value: boolean) => void;
  onChangePassword: () => void;
}

export const ProfilePasswordSection = ({
  currentPassword,
  newPassword,
  confirmPassword,
  showCurrentPassword,
  showNewPassword,
  showConfirmPassword,
  changingPassword,
  confirmPassRef,
  setCurrentPassword,
  setNewPassword,
  setConfirmPassword,
  setShowCurrentPassword,
  setShowNewPassword,
  setShowConfirmPassword,
  onChangePassword,
}: ProfilePasswordSectionProps) => {
  const strength = getStrength(newPassword);
  const [strengthBg, strengthText] = strength.color.split(' ');
  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const passwordMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit =
    !changingPassword && currentPassword && newPassword && confirmPassword && !passwordMismatch;

  return (
    <div className="space-y-5">
      {/* Security tip */}
      <div className="flex items-start gap-3 rounded-xl border border-border/30 bg-surface-1/50 px-4 py-3 text-xs text-muted dark:bg-surface-dark-1/40">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <span>
          Use at least <strong className="text-text">8 characters</strong> with a mix of uppercase,
          numbers, and symbols for a strong password.
        </span>
      </div>

      <PasswordField
        id="currentPassword"
        label="Current password"
        value={currentPassword}
        placeholder="Enter current password"
        show={showCurrentPassword}
        onChange={setCurrentPassword}
        onToggleShow={() => setShowCurrentPassword(!showCurrentPassword)}
      />

      {/* New password + strength */}
      <div className="space-y-2">
        <PasswordField
          id="newPassword"
          label="New password"
          value={newPassword}
          placeholder="Enter new password"
          show={showNewPassword}
          onChange={setNewPassword}
          onToggleShow={() => setShowNewPassword(!showNewPassword)}
        />
        {newPassword.length > 0 && (
          <div className="space-y-1.5" aria-live="polite">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <div
                  key={n}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                    n <= strength.score ? (strengthBg ?? 'bg-accent') : 'bg-border/30'
                  }`}
                />
              ))}
            </div>
            <p className={`text-xs font-semibold ${strengthText ?? 'text-muted'}`}>
              {strength.label}
            </p>
          </div>
        )}
      </div>

      {/* Confirm password */}
      <div>
        <PasswordField
          id="confirmPassword"
          label="Confirm new password"
          value={confirmPassword}
          placeholder="Repeat new password"
          show={showConfirmPassword}
          inputRef={confirmPassRef}
          onChange={setConfirmPassword}
          onToggleShow={() => setShowConfirmPassword(!showConfirmPassword)}
        />
        {passwordMismatch && (
          <p className="mt-1.5 text-xs font-semibold text-danger" role="alert">
            Passwords do not match
          </p>
        )}
        {passwordMatch && (
          <p className="mt-1.5 text-xs font-semibold text-success" role="status">
            Passwords match ✓
          </p>
        )}
      </div>

      <button
        onClick={onChangePassword}
        disabled={!canSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        {changingPassword ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Changing password…
          </>
        ) : (
          <>
            <Key className="h-4 w-4" />
            Change Password
          </>
        )}
      </button>
    </div>
  );
};
