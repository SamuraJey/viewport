import { useRouteError, Link } from 'react-router-dom';
import type { ErrorInfo, ReactNode } from 'react';
import {
  AlertTriangle,
  Home,
  RefreshCw,
  Lock,
  FileQuestion,
  ServerCrash,
  Wifi,
  Clock,
} from 'lucide-react';
import { useErrorDetails } from '../hooks';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

interface ErrorPageProps {
  statusCode?: number;
  title?: string;
  message?: string;
  showBackButton?: boolean;
  onRetry?: () => void;
  error?: unknown;
  errorInfo?: ErrorInfo;
}

const statusIcons: Record<number, ReactNode> = {
  403: <Lock className="w-20 h-20 text-red-400" />,
  404: <FileQuestion className="w-20 h-20 text-blue-400" />,
  500: <ServerCrash className="w-20 h-20 text-red-500" />,
  503: <Wifi className="w-20 h-20 text-yellow-400" />,
  408: <Clock className="w-20 h-20 text-orange-400" />,
};

interface ErrorActionsProps {
  showBackButton: boolean;
  onRetry?: () => void;
}

const ErrorActions = ({ showBackButton, onRetry }: ErrorActionsProps) => (
  <div className="flex flex-col justify-center gap-3 sm:flex-row">
    {showBackButton && (
      <Link
        to="/"
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 font-semibold text-accent-foreground no-underline transition-all duration-200 hover:-translate-y-0.5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        <Home className="w-5 h-5" />
        Go Home
      </Link>
    )}

    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-6 py-3 font-semibold text-text shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        <RefreshCw className="w-5 h-5" />
        Try Again
      </button>
    )}

    <button
      type="button"
      onClick={() => window.location.reload()}
      className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-transparent px-6 py-3 font-medium text-muted shadow-sm transition-all duration-200 hover:border-accent/30 hover:bg-surface-1 hover:text-text focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
    >
      <RefreshCw className="w-5 h-5" />
      Refresh Page
    </button>
  </div>
);

interface ErrorDiagnosticsProps {
  errorStatus: number;
  stackTrace: string | null;
  error?: unknown;
}

const ErrorDiagnostics = ({ errorStatus, stackTrace, error }: ErrorDiagnosticsProps) => (
  <div className="mt-12 text-sm text-muted">
    <p>Error Code: {errorStatus}</p>
    {stackTrace ? (
      <details className="mt-4 rounded-xl border border-border/40 bg-surface-1 p-4 text-left">
        <summary className="cursor-pointer text-muted mb-2">Stack Trace</summary>
        <pre className="text-xs text-muted overflow-auto whitespace-pre-wrap">{stackTrace}</pre>
      </details>
    ) : null}
    {error && import.meta.env.DEV && typeof error === 'object' && error !== null ? (
      <details className="mt-4 rounded-xl border border-border/40 bg-surface-1 p-4 text-left">
        <summary className="cursor-pointer text-muted mb-2">Debug Information (JSON)</summary>
        <pre className="text-xs text-muted overflow-auto">{JSON.stringify(error, null, 2)}</pre>
      </details>
    ) : null}
  </div>
);

// Internal component that handles the actual error display
const ErrorPageContent = ({
  statusCode,
  title,
  message,
  showBackButton = true,
  onRetry,
  error,
  errorInfo,
}: ErrorPageProps) => {
  const { errorStatus, errorDetails, stackTrace } = useErrorDetails(
    statusCode,
    title,
    message,
    error,
    errorInfo,
  );
  useDocumentTitle(`${errorDetails.title} · Viewport`);

  const errorIcon = statusIcons[errorStatus] ?? <AlertTriangle className="w-20 h-20 text-muted" />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4 text-text dark:bg-surface-dark">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_30%_0%,rgba(31,144,255,0.14),transparent_40%)]" />
      <div className="relative w-full max-w-2xl text-center">
        <div className="mb-8 flex justify-center">{errorIcon}</div>

        <div className="mb-6">
          <h1 className="font-oswald text-8xl font-bold leading-none text-accent/20 md:text-9xl">
            {errorStatus}
          </h1>
        </div>

        <div className="mb-8 rounded-3xl border border-border/55 bg-surface/90 p-8 shadow-2xl backdrop-blur-sm dark:border-white/10 dark:bg-surface-dark-1/90">
          <h2 className="mb-4 text-4xl font-bold tracking-tight text-text">{errorDetails.title}</h2>
          <p className="mb-4 text-xl text-muted">{errorDetails.description}</p>
          <p className="text-muted">{errorDetails.suggestion}</p>
        </div>

        <ErrorActions showBackButton={showBackButton} onRetry={onRetry} />
        <ErrorDiagnostics errorStatus={errorStatus} stackTrace={stackTrace} error={error} />
      </div>
    </div>
  );
};

// Main ErrorPage component for general use (doesn't use router hooks)
export const ErrorPage = (props: ErrorPageProps) => <ErrorPageContent {...props} />;

// RouterErrorPage component for use as a router errorElement (uses useRouteError hook)
export const RouterErrorPage = () => {
  const error = useRouteError();
  return <ErrorPageContent error={error} />;
};

// Specific error page components for common status codes
export const NotFoundPage = () => (
  <ErrorPage
    statusCode={404}
    title="Page Not Found"
    message="The page you're looking for doesn't exist"
  />
);

export const ForbiddenPage = () => (
  <ErrorPage
    statusCode={403}
    title="Access Forbidden"
    message="You don't have permission to access this resource"
  />
);

export const ServerErrorPage = () => (
  <ErrorPage
    statusCode={500}
    title="Internal Server Error"
    message="Something went wrong on our end"
  />
);

export const ServiceUnavailablePage = () => (
  <ErrorPage
    statusCode={503}
    title="Service Unavailable"
    message="Our service is temporarily down for maintenance"
  />
);

export const TimeoutPage = () => (
  <ErrorPage
    statusCode={408}
    title="Request Timeout"
    message="The request took too long to complete"
  />
);
