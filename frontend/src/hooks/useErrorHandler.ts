import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { handleApiError, shouldShowErrorPage, formatErrorMessage, ApiError } from '../lib/errorHandling'

interface UseErrorHandlerResult {
  error: string | null
  clearError: () => void
  handleError: (error: unknown) => void
  isLoading: boolean
  setLoading: (loading: boolean) => void
}

export const useErrorHandler = (): UseErrorHandlerResult => {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const handleError = useCallback((error: unknown) => {
    console.error('Error handled:', error)
    
    const apiError = handleApiError(error)
    
    // For certain errors, redirect to error page
    if (shouldShowErrorPage(error)) {
      navigate(`/error/${apiError.statusCode}`, { replace: true })
      return
    }
    
    // For other errors, show inline error message
    setError(formatErrorMessage(error))
  }, [navigate])

  const setLoading = useCallback((loading: boolean) => {
    setIsLoading(loading)
    if (loading) {
      clearError() // Clear errors when starting new operation
    }
  }, [clearError])

  return {
    error,
    clearError,
    handleError,
    isLoading,
    setLoading
  }
}

// Specialized hook for async operations
export const useAsyncOperation = () => {
  const errorHandler = useErrorHandler()

  const executeAsync = useCallback(async <T>(
    operation: () => Promise<T>,
    onSuccess?: (result: T) => void,
    onError?: (error: ApiError) => void
  ): Promise<T | null> => {
    try {
      errorHandler.setLoading(true)
      const result = await operation()
      onSuccess?.(result)
      return result
    } catch (error) {
      const apiError = handleApiError(error)
      
      if (onError) {
        onError(apiError)
      } else {
        errorHandler.handleError(error)
      }
      
      return null
    } finally {
      errorHandler.setLoading(false)
    }
  }, [errorHandler])

  return {
    ...errorHandler,
    executeAsync
  }
}

// Hook for handling network errors specifically
export const useNetworkErrorHandler = () => {
  const errorHandler = useErrorHandler()

  const handleNetworkError = useCallback((error: unknown) => {
    const apiError = handleApiError(error)
    
    // Handle network-specific errors
    if (apiError.statusCode === 0 || !navigator.onLine) {
      errorHandler.handleError(new Error('No internet connection. Please check your network and try again.'))
    } else {
      errorHandler.handleError(error)
    }
  }, [errorHandler])

  return {
    ...errorHandler,
    handleError: handleNetworkError
  }
}
