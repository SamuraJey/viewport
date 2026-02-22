import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../services/authService';
import { useAuthStore } from '../stores/authStore';
import { validateEmail } from '../lib/utils';
import { Mail, LogIn, UserPlus } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { AuthCard } from '../components/auth/AuthCard';
import { AuthPasswordField, AuthTextField } from '../components/auth/AuthFields';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuthStore();

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (!password) {
      setError('Password is required');
      return;
    }

    setIsLoading(true);

    try {
      const response = await authService.login({ email, password });
      login(
        {
          id: response.id,
          email: response.email,
          display_name: response.display_name,
          storage_used: response.storage_used,
          storage_quota: response.storage_quota,
        },
        response.tokens,
      );
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="relative w-full max-w-md">
        <AuthCard title="Welcome back" subtitle="Sign in to your Viewport account">
          <form onSubmit={handleSubmit} className="space-y-6">
            <AuthTextField
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              label="Email address"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email address"
              rightAdornment={<Mail className="h-5 w-5" />}
            />

            <AuthPasswordField
              id="password"
              name="password"
              autoComplete="current-password"
              required
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Password"
            />

            {/* Error Message */}
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
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="h-5 w-5" />
                  Sign in
                </>
              )}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border dark:border-border"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-surface dark:bg-surface-foreground text-muted dark:text-text">
                  New to Viewport?
                </span>
              </div>
            </div>

            <div className="text-center">
              <Link
                to="/auth/register"
                className="inline-flex items-center gap-1 text-sm font-medium text-text dark:text-accent-foreground hover:text-accent dark:hover:text-accent-foreground"
              >
                <UserPlus className="h-4 w-4" />
                Create your account
              </Link>
            </div>
          </form>
        </AuthCard>
      </div>
    </AuthLayout>
  );
};
