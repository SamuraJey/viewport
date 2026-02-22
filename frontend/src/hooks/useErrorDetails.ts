import { isRouteErrorResponse } from 'react-router-dom';
import type { ErrorInfo } from 'react';

export interface ErrorDetails {
  title: string;
  description: string;
  suggestion: string;
  bgGradient: string;
}

export const useErrorDetails = (
  statusCode?: number,
  title?: string,
  message?: string,
  error?: unknown,
  errorInfo?: ErrorInfo,
) => {
  // Extract error info from router error if no props provided
  let errorStatus = statusCode;
  let errorTitle = title;
  let errorMessage = message;

  if (!errorStatus && error && isRouteErrorResponse(error)) {
    errorStatus = error.status;
    errorTitle = error.statusText;
    errorMessage = error.data?.message || error.data;
  }

  // Default fallback
  errorStatus = errorStatus || 500;
  errorTitle = errorTitle || 'Something went wrong';
  errorMessage = errorMessage || 'An unexpected error occurred';

  const getErrorDetails = (status: number): ErrorDetails => {
    switch (status) {
      case 403:
        return {
          title: 'Access Forbidden',
          description: "You don't have permission to access this resource.",
          suggestion: 'Please check your credentials or contact an administrator.',
          bgGradient: 'from-red-900 via-red-800 to-gray-900',
        };
      case 404:
        return {
          title: 'Page Not Found',
          description: "The page you're looking for doesn't exist or has been moved.",
          suggestion: 'Check the URL or navigate back to continue browsing.',
          bgGradient: 'from-blue-900 via-indigo-800 to-gray-900',
        };
      case 500:
        return {
          title: 'Internal Server Error',
          description: "Something went wrong on our end. We're working to fix it.",
          suggestion: 'Please try again later or contact support if the problem persists.',
          bgGradient: 'from-red-900 via-red-800 to-gray-900',
        };
      case 503:
        return {
          title: 'Service Unavailable',
          description: 'Our service is temporarily down for maintenance.',
          suggestion: 'Please try again in a few minutes.',
          bgGradient: 'from-yellow-900 via-orange-800 to-gray-900',
        };
      case 408:
        return {
          title: 'Request Timeout',
          description: 'The request took too long to complete.',
          suggestion: 'Please check your connection and try again.',
          bgGradient: 'from-orange-900 via-amber-800 to-gray-900',
        };
      default:
        return {
          title: errorTitle || 'Error',
          description: errorMessage || 'An unexpected error occurred.',
          suggestion: 'Please try refreshing the page or contact support.',
          bgGradient: 'from-gray-900 via-gray-800 to-gray-900',
        };
    }
  };

  const errorDetails = getErrorDetails(errorStatus);

  const stackTrace = (() => {
    if (error && typeof error === 'object' && 'stack' in error && typeof error.stack === 'string') {
      return error.stack;
    }
    if (errorInfo?.componentStack) {
      return errorInfo.componentStack;
    }
    return null;
  })();

  return {
    errorStatus,
    errorDetails,
    stackTrace,
  };
};
