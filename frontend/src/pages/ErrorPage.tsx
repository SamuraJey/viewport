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
  <div className="flex flex-col sm:flex-row gap-4 justify-center">
    {showBackButton && (
      <Link
        to="/"
        className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-semibold py-3 px-6 rounded-lg transition-all hover:-translate-y-0.5 no-underline"
      >
        <Home className="w-5 h-5" />
        Go Home
      </Link>
    )}

    {onRetry && (
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 bg-surface-foreground/10 hover:bg-surface-foreground/20 text-accent-foreground font-semibold py-3 px-6 rounded-lg shadow-sm hover:-translate-y-0.5 transition-all duration-200 border border-border"
      >
        <RefreshCw className="w-5 h-5" />
        Try Again
      </button>
    )}

    <button
      onClick={() => window.location.reload()}
      className="inline-flex items-center gap-2 bg-transparent hover:bg-surface-foreground/10 text-muted hover:text-text font-medium py-3 px-6 rounded-lg shadow-sm transition-all duration-200 border border-border hover:border-border/50"
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
      <details className="mt-4 text-left bg-surface-foreground/10 rounded-lg p-4">
        <summary className="cursor-pointer text-muted mb-2">Stack Trace</summary>
        <pre className="text-xs text-muted overflow-auto whitespace-pre-wrap">{stackTrace}</pre>
      </details>
    ) : null}
    {error && import.meta.env.DEV && typeof error === 'object' && error !== null ? (
      <details className="mt-4 text-left bg-surface-foreground/10 rounded-lg p-4">
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
    <div
      className={`min-h-screen bg-linear-to-br ${errorDetails.bgGradient} flex items-center justify-center p-4`}
    >
      <div className="max-w-2xl w-full text-center">
        <div className="flex justify-center mb-8">{errorIcon}</div>

        <div className="mb-6">
          <h1 className="text-8xl md:text-9xl font-bold text-white/20 leading-none">
            {errorStatus}
          </h1>
        </div>

        <div className="bg-surface-foreground/5 backdrop-blur-sm rounded-2xl p-8 border border-border mb-8">
          <h2 className="text-4xl font-bold text-white mb-4">{errorDetails.title}</h2>
          <p className="text-xl text-muted mb-4">{errorDetails.description}</p>
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
