import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import { validateEmail, validatePassword } from '../lib/utils';
import { UserPlus, Mail, CheckCircle } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { AuthCard } from '../components/auth/AuthCard';
import { AuthPasswordField, AuthTextField } from '../components/auth/AuthFields';

export const RegisterPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      setError(passwordValidation.errors[0]);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!inviteCode.trim()) {
      setError('Invite code is required.');
      return;
    }

    setIsLoading(true);

    try {
      await authService.register({ email, password, invite_code: inviteCode });
      setSuccess(true);
      setTimeout(() => {
        navigate('/auth/login', {
          state: { message: 'Registration successful! Please sign in.' },
        });
      }, 2000);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderForm = () => (
    <AuthCard title="Create Account" subtitle="Join Viewport and start sharing your moments.">
      <form onSubmit={handleSubmit} className="space-y-6">
        <AuthTextField
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          label="Email Address"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email address"
          rightAdornment={<Mail className="h-5 w-5" />}
        />
        <AuthTextField
          id="inviteCode"
          name="inviteCode"
          type="text"
          autoComplete="off"
          required
          label="Invite Code"
          placeholder="Enter your invite code"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          aria-label="Invite code"
        />
        <AuthPasswordField
          id="password"
          name="password"
          autoComplete="new-password"
          required
          label="Password"
          placeholder="Create a password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="Password"
        />
        <div>
          <AuthPasswordField
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            required
            label="Confirm Password"
            placeholder="Confirm your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-label="Confirm password"
          />
          <p className="text-xs text-muted dark:text-text mt-2">
            Password must be at least 8 characters long.
          </p>
        </div>
        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-center text-sm">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-accent text-accent-foreground font-semibold py-3 px-6 rounded-lg shadow-sm hover:shadow-lg hover:shadow-accent/25 hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-sm flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              Creating account...
            </>
          ) : (
            <>
              <UserPlus className="h-5 w-5" />
              Create Account
            </>
          )}
        </button>
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border dark:border-border"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-surface dark:bg-surface-foreground text-muted dark:text-text">
              Already have an account?
            </span>
          </div>
        </div>
        <div className="text-center">
          <Link
            to="/auth/login"
            className="inline-flex items-center text-sm font-medium text-text dark:text-accent-foreground hover:text-accent dark:hover:text-accent-foreground"
          >
            Sign in to your account
          </Link>
        </div>
      </form>
    </AuthCard>
  );

  const renderSuccess = () => (
    <div className="relative z-10 w-full max-w-md p-8 flex flex-col gap-6 bg-surface dark:bg-surface-foreground/95 backdrop-blur-lg rounded-xl border border-border dark:border-white/10 text-center">
      <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
      <h2 className="text-3xl font-bold text-text dark:text-white">Registration Successful!</h2>
      <p className="text-lg text-muted dark:text-text">Redirecting you to sign in...</p>
    </div>
  );

  return (
    <AuthLayout>
      <div className="relative w-full max-w-md">{success ? renderSuccess() : renderForm()}</div>
    </AuthLayout>
  );
};
