import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type BaseInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  id: string;
  label: string;
  rightAdornment?: ReactNode;
};

const baseInputClassName =
  'w-full px-4 py-3.5 bg-surface-1 border-2 border-border/50 text-text rounded-xl focus:outline-hidden focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/20 backdrop-blur-sm transition-all duration-200 hover:border-accent/35 shadow-xs placeholder:text-muted dark:bg-surface-dark-1';

export const AuthTextField = ({ id, label, rightAdornment, ...inputProps }: BaseInputProps) => (
  <div>
    <label
      htmlFor={id}
      className="block text-sm font-bold text-text dark:text-text mb-2 uppercase tracking-wider"
    >
      {label}
    </label>
    <div className="relative group">
      <input
        id={id}
        className={`${baseInputClassName} ${rightAdornment ? 'pr-12' : ''}`}
        {...inputProps}
      />
      {rightAdornment ? (
        <div className="pointer-events-none absolute right-4 top-1/2 transform -translate-y-1/2 text-muted group-focus-within:text-accent transition-colors duration-200">
          {rightAdornment}
        </div>
      ) : null}
    </div>
  </div>
);

type PasswordFieldProps = Omit<BaseInputProps, 'rightAdornment' | 'type'>;

export const AuthPasswordField = ({ id, label, ...inputProps }: PasswordFieldProps) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-bold text-text dark:text-text mb-2 uppercase tracking-wider"
      >
        {label}
      </label>
      <div className="relative group">
        <input
          id={id}
          type={showPassword ? 'text' : 'password'}
          className={`${baseInputClassName} pr-12`}
          {...inputProps}
        />
        <button
          type="button"
          className="absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer rounded-lg p-1 text-muted transition-all duration-200 hover:scale-110 hover:text-text active:scale-95 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent group-focus-within:text-accent"
          onClick={() => setShowPassword((prev) => !prev)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
};
