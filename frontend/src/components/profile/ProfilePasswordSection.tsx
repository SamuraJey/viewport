import type { RefObject } from 'react';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  show: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
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
  onChange,
  onToggleShow,
}: PasswordFieldProps) => (
  <div>
    <label htmlFor={id} className="block text-sm font-semibold text-text mb-2">
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
        className="w-full px-4 py-3 pr-12 border border-border rounded-xl bg-transparent focus:outline-hidden focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
      />
      <button
        type="button"
        aria-label={show ? 'Hide password' : 'Show password'}
        onClick={onToggleShow}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded-lg transition-all duration-200 hover:scale-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
      >
        {show ? (
          <EyeOff className="h-5 w-5 text-muted group-focus-within:text-accent" />
        ) : (
          <Eye className="h-5 w-5 text-muted group-focus-within:text-accent" />
        )}
      </button>
    </div>
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
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <Lock className="w-5 h-5 text-accent" />
        <h3 className="text-lg font-semibold text-text">Change Password</h3>
      </div>

      <div className="bg-surface-1 dark:bg-surface-dark-1 rounded-2xl p-6 space-y-5 border border-border/40 shadow-xs">
        <PasswordField
          id="currentPassword"
          label="Current Password"
          value={currentPassword}
          placeholder="Enter current password"
          show={showCurrentPassword}
          onChange={setCurrentPassword}
          onToggleShow={() => setShowCurrentPassword(!showCurrentPassword)}
        />
        <PasswordField
          id="newPassword"
          label="New Password"
          value={newPassword}
          placeholder="Enter new password"
          show={showNewPassword}
          onChange={setNewPassword}
          onToggleShow={() => setShowNewPassword(!showNewPassword)}
        />
        <PasswordField
          id="confirmPassword"
          label="Confirm New Password"
          value={confirmPassword}
          placeholder="Confirm new password"
          show={showConfirmPassword}
          inputRef={confirmPassRef}
          onChange={setConfirmPassword}
          onToggleShow={() => setShowConfirmPassword(!showConfirmPassword)}
        />

        <button
          onClick={onChangePassword}
          disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
          className="w-full px-4 py-3 bg-accent text-accent-foreground font-semibold rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {changingPassword ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Changing Password...
            </>
          ) : (
            <>
              <Lock className="w-5 h-5" />
              Change Password
            </>
          )}
        </button>
      </div>
    </section>
  );
};
