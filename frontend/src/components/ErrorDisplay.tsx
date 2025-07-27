import { AlertCircle, RefreshCw, X } from 'lucide-react'

interface ErrorDisplayProps {
  error: string
  onRetry?: () => void
  onDismiss?: () => void
  variant?: 'inline' | 'banner' | 'card'
  className?: string
}

export const ErrorDisplay = ({ 
  error, 
  onRetry, 
  onDismiss, 
  variant = 'inline',
  className = ''
}: ErrorDisplayProps) => {
  const baseClasses = 'bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg'
  
  const variantClasses = {
    inline: 'px-4 py-3 flex items-center justify-between',
    banner: 'px-6 py-4 flex items-center justify-between',
    card: 'p-6 text-center'
  }

  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      {variant === 'card' ? (
        <div className="space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <div>
            <h3 className="text-lg font-semibold text-red-300 mb-2">Error</h3>
            <p className="text-red-400">{error}</p>
          </div>
          <div className="flex justify-center gap-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 px-4 py-2 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="inline-flex items-center gap-2 bg-gray-500/20 hover:bg-gray-500/30 text-gray-300 px-4 py-2 rounded-lg transition-colors"
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
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
          <div className="flex items-center gap-2">
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-red-400 hover:text-red-300 transition-colors text-sm"
              >
                Dismiss
              </button>
            )}
            {onRetry && (
              <button
                onClick={onRetry}
                className="text-red-400 hover:text-red-300 transition-colors"
                title="Retry"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Network status component
export const NetworkStatus = () => {
  const isOnline = navigator.onLine

  if (isOnline) return null

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
      <AlertCircle className="w-4 h-4" />
      You're currently offline. Some features may not work properly.
    </div>
  )
}
