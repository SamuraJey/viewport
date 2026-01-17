import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../services/authService';
import { useAuthStore } from '../stores/authStore';
import { validateEmail } from '../lib/utils';
import { Eye, EyeOff, Camera, Mail, LogIn, UserPlus } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
        {/* Card container */}
        <div className="bg-surface dark:bg-surface-foreground/95 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-border dark:border-border/10">
          {/* Logo/Brand area */}
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center mx-auto mb-4">
              <Camera className="h-6 w-6 text-white" />
            </div>
            <h2 className="font-oswald text-3xl font-bold uppercase tracking-wider text-text dark:text-accent-foreground mb-2">
              Welcome back
            </h2>
            <p className="text-muted dark:text-text font-cuprum">
              Sign in to your Viewport account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Field */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-text dark:text-text mb-2 uppercase tracking-wide"
              >
                Email address
              </label>
              <div className="relative">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="w-full px-4 py-3 pr-12 bg-surface dark:bg-surface-foreground/80 border-2 border-border dark:border-border rounded-lg focus:outline-none focus:border-accent focus:bg-surface dark:focus:bg-surface-foreground focus:ring-4 focus:ring-accent/20 backdrop-blur-sm text-text dark:text-accent-foreground transition-all duration-200 hover:border-border/80"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label="Email address"
                />
                <Mail className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted dark:text-text" />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-text dark:text-text mb-2 uppercase tracking-wide"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="w-full px-4 py-3 pr-12 bg-surface dark:bg-surface-foreground/80 border-2 border-border dark:border-border text-text dark:text-accent-foreground rounded-lg focus:outline-none focus:border-accent focus:bg-surface dark:focus:bg-surface-foreground focus:ring-4 focus:ring-accent/20 backdrop-blur-sm transition-all duration-200 hover:border-border/80"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-label="Password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted dark:text-text hover:text-text dark:hover:text-accent-foreground transition-all duration-200 hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-center text-sm">
                {error}
              </div>
            )}

            {/* Submit Button */}
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

            {/* Divider */}
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

            {/* Register Link */}
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
        </div>
      </div>
    </AuthLayout>
  );
};
