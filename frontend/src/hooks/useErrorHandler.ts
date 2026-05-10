import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { handleApiError, shouldShowErrorPage, formatErrorMessage } from '../lib/errorHandling';

interface UseErrorHandlerResult {
  error: string | null;
  clearError: () => void;
  handleError: (error: unknown) => void;
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

export const useErrorHandler = (): UseErrorHandlerResult => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleError = useCallback(
    (error: unknown) => {
      console.error('Error handled:', error);

      const apiError = handleApiError(error);

      // For certain errors, redirect to error page
      if (shouldShowErrorPage(error)) {
        navigate(`/error/${apiError.statusCode}`, { replace: true });
        return;
      }

      // For other errors, show inline error message
      setError(formatErrorMessage(error));
    },
    [navigate],
  );

  const setLoading = useCallback(
    (loading: boolean) => {
      setIsLoading(loading);
      if (loading) {
        clearError(); // Clear errors when starting new operation
      }
    },
    [clearError],
  );

  return {
    error,
    clearError,
    handleError,
    isLoading,
    setLoading,
  };
};
