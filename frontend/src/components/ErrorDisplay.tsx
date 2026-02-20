import { AlertCircle, RefreshCw, X } from 'lucide-react';
import { useOnline } from '../hooks/useOnline';

interface ErrorDisplayProps {
  error: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  variant?: 'inline' | 'banner' | 'card';
  className?: string;
}

export const ErrorDisplay = ({
  error,
  onRetry,
  onDismiss,
  variant = 'inline',
  className = '',
}: ErrorDisplayProps) => {
  const baseClasses =
    'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 rounded-lg';

  const variantClasses = {
    inline: 'px-4 py-3 flex items-center justify-between',
    banner: 'px-6 py-4 flex items-center justify-between',
    card: 'p-6 text-center',
  };

  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      {variant === 'card' ? (
        <div className="space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500 dark:text-red-400 mx-auto" />
          <div>
            <h3 className="text-lg font-semibold text-red-700 dark:text-red-300 mb-2">Error</h3>
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
          <div className="flex justify-center gap-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-2 bg-red-100 dark:bg-red-500/20 hover:bg-red-200 dark:hover:bg-red-500/30 text-red-700 dark:text-red-300 px-4 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="inline-flex items-center gap-2 bg-surface-foreground dark:bg-surface hover:bg-surface text-text dark:text-text px-4 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
              >
                <X className="w-4 h-4" />
                Dismiss
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
          <div className="flex items-center gap-2">
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-all duration-200 hover:scale-105 text-sm"
              >
                Dismiss
              </button>
            )}
            {onRetry && (
              <button
                onClick={onRetry}
                className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-all duration-200 hover:scale-110"
                title="Retry"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// Network status component (reactive)

export const NetworkStatus = () => {
  const isOnline = useOnline();

  if (isOnline) return null;

  return (
    <div className="mb-6 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 text-yellow-700 dark:text-yellow-400 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
      <AlertCircle className="w-4 h-4" />
      <span className="truncate">
        You're currently offline. Some features may not work properly.
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 bg-yellow-100 dark:bg-yellow-500/10 hover:bg-yellow-200 dark:hover:bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 px-3 py-1 rounded-lg text-sm shadow-sm"
          title="Retry"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    </div>
  );
};
