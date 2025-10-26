import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom'
import { AlertTriangle, Home, RefreshCw, Lock, FileQuestion, ServerCrash, Wifi, Clock } from 'lucide-react'

interface ErrorPageProps {
  statusCode?: number
  title?: string
  message?: string
  showBackButton?: boolean
  onRetry?: () => void
  error?: unknown
}

// Internal component that handles the actual error display
const ErrorPageContent = ({
  statusCode,
  title,
  message,
  showBackButton = true,
  onRetry,
  error
}: ErrorPageProps) => {
  // Extract error info from router error if no props provided
  let errorStatus = statusCode
  let errorTitle = title
  let errorMessage = message

  if (!errorStatus && error && isRouteErrorResponse(error)) {
    errorStatus = error.status
    errorTitle = error.statusText
    errorMessage = error.data?.message || error.data
  }

  // Default fallback
  errorStatus = errorStatus || 500
  errorTitle = errorTitle || 'Something went wrong'
  errorMessage = errorMessage || 'An unexpected error occurred'

  const getErrorIcon = (status: number) => {
    switch (status) {
      case 403:
        return <Lock className="w-20 h-20 text-red-400" />
      case 404:
        return <FileQuestion className="w-20 h-20 text-blue-400" />
      case 500:
        return <ServerCrash className="w-20 h-20 text-red-500" />
      case 503:
        return <Wifi className="w-20 h-20 text-yellow-400" />
      case 408:
        return <Clock className="w-20 h-20 text-orange-400" />
      default:
        return <AlertTriangle className="w-20 h-20 text-text-muted" />
    }
  }

  const getErrorDetails = (status: number) => {
    switch (status) {
      case 403:
        return {
          title: 'Access Forbidden',
          description: 'You don\'t have permission to access this resource.',
          suggestion: 'Please check your credentials or contact an administrator.',
          bgGradient: 'from-red-900 via-red-800 to-gray-900'
        }
      case 404:
        return {
          title: 'Page Not Found',
          description: 'The page you\'re looking for doesn\'t exist or has been moved.',
          suggestion: 'Check the URL or navigate back to continue browsing.',
          bgGradient: 'from-blue-900 via-indigo-800 to-gray-900'
        }
      case 500:
        return {
          title: 'Internal Server Error',
          description: 'Something went wrong on our end. We\'re working to fix it.',
          suggestion: 'Please try again later or contact support if the problem persists.',
          bgGradient: 'from-red-900 via-red-800 to-gray-900'
        }
      case 503:
        return {
          title: 'Service Unavailable',
          description: 'Our service is temporarily down for maintenance.',
          suggestion: 'Please try again in a few minutes.',
          bgGradient: 'from-yellow-900 via-orange-800 to-gray-900'
        }
      case 408:
        return {
          title: 'Request Timeout',
          description: 'The request took too long to complete.',
          suggestion: 'Please check your connection and try again.',
          bgGradient: 'from-orange-900 via-amber-800 to-gray-900'
        }
      default:
        return {
          title: errorTitle || 'Error',
          description: errorMessage || 'An unexpected error occurred.',
          suggestion: 'Please try refreshing the page or contact support.',
          bgGradient: 'from-gray-900 via-gray-800 to-gray-900'
        }
    }
  }

  const errorDetails = getErrorDetails(errorStatus)

  return (
    <div className={`min-h-screen bg-gradient-to-br ${errorDetails.bgGradient} flex items-center justify-center p-4`}>
      <div className="max-w-2xl w-full text-center">
        {/* Error Icon */}
        <div className="flex justify-center mb-8">
          {getErrorIcon(errorStatus)}
        </div>

        {/* Error Code */}
        <div className="mb-6">
          <h1 className="text-8xl md:text-9xl font-bold text-white/20 leading-none">
            {errorStatus}
          </h1>
        </div>

        {/* Error Details */}
        <div className="bg-surface-foreground/5 backdrop-blur-sm rounded-2xl p-8 border border-border mb-8">
          <h2 className="text-4xl font-bold text-white mb-4">
            {errorDetails.title}
          </h2>
          <p className="text-xl text-text-muted mb-4">
            {errorDetails.description}
          </p>
          <p className="text-text-muted">
            {errorDetails.suggestion}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {showBackButton && (
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-semibold py-3 px-6 rounded-lg transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/25 no-underline"
            >
              <Home className="w-5 h-5" />
              Go Home
            </Link>
          )}

          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 bg-surface-foreground/10 hover:bg-surface-foreground/20 text-accent-foreground font-semibold py-3 px-6 rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-border"
            >
              <RefreshCw className="w-5 h-5" />
              Try Again
            </button>
          )}

          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 bg-transparent hover:bg-surface-foreground/10 text-text-muted hover:text-text font-medium py-3 px-6 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border border-border hover:border-border/50"
          >
            <RefreshCw className="w-5 h-5" />
            Refresh Page
          </button>
        </div>

        {/* Additional Info */}
        <div className="mt-12 text-sm text-text-muted">
          <p>Error Code: {errorStatus}</p>
          {error && import.meta.env.DEV && typeof error === 'object' && error !== null ? (
            <details className="mt-4 text-left bg-surface-foreground/10 rounded-lg p-4">
              <summary className="cursor-pointer text-text-muted mb-2">
                Debug Information (Development Only)
              </summary>
              <pre className="text-xs text-text-muted overflow-auto">
                {JSON.stringify(error, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// Main ErrorPage component for general use (doesn't use router hooks)
export const ErrorPage = (props: ErrorPageProps) => (
  <ErrorPageContent {...props} />
)

// RouterErrorPage component for use as a router errorElement (uses useRouteError hook)
export const RouterErrorPage = () => {
  const error = useRouteError()
  return <ErrorPageContent error={error} />
}

// Specific error page components for common status codes
export const NotFoundPage = () => (
  <ErrorPage
    statusCode={404}
    title="Page Not Found"
    message="The page you're looking for doesn't exist"
  />
)

export const ForbiddenPage = () => (
  <ErrorPage
    statusCode={403}
    title="Access Forbidden"
    message="You don't have permission to access this resource"
  />
)

export const ServerErrorPage = () => (
  <ErrorPage
    statusCode={500}
    title="Internal Server Error"
    message="Something went wrong on our end"
  />
)

export const ServiceUnavailablePage = () => (
  <ErrorPage
    statusCode={503}
    title="Service Unavailable"
    message="Our service is temporarily down for maintenance"
  />
)

export const TimeoutPage = () => (
  <ErrorPage
    statusCode={408}
    title="Request Timeout"
    message="The request took too long to complete"
  />
)
