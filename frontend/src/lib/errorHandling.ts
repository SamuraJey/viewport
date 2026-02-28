import { AxiosError } from 'axios';

export interface ApiErrorData {
  detail?: unknown;
  message?: string;
  errors?: Record<string, string[]>;
}

const normalizeApiErrorMessage = (data?: ApiErrorData): string | null => {
  if (!data) return null;

  if (typeof data.detail === 'string' && data.detail.trim()) {
    return data.detail;
  }

  if (Array.isArray(data.detail)) {
    for (const item of data.detail) {
      if (typeof item === 'string' && item.trim()) {
        return item;
      }

      if (
        item &&
        typeof item === 'object' &&
        'msg' in item &&
        typeof (item as { msg?: unknown }).msg === 'string'
      ) {
        return (item as { msg: string }).msg;
      }
    }
  }

  if (
    data.detail &&
    typeof data.detail === 'object' &&
    'msg' in data.detail &&
    typeof (data.detail as { msg?: unknown }).msg === 'string'
  ) {
    return (data.detail as { msg: string }).msg;
  }

  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message;
  }

  if (data.errors && typeof data.errors === 'object') {
    for (const messages of Object.values(data.errors)) {
      if (Array.isArray(messages)) {
        const firstMessage = messages.find((msg) => typeof msg === 'string' && msg.trim());
        if (firstMessage) return firstMessage;
      }
    }
  }

  return null;
};

export class ApiError extends Error {
  public statusCode: number;
  public data?: ApiErrorData;

  constructor(statusCode: number, message: string, data?: ApiErrorData) {
    super(message);
    this.statusCode = statusCode;
    this.data = data;
    this.name = 'ApiError';
  }

  static fromAxiosError(error: AxiosError<ApiErrorData>): ApiError {
    const statusCode = error.response?.status || 500;
    const data = error.response?.data;
    const message = normalizeApiErrorMessage(data) || error.message || 'An error occurred';

    return new ApiError(statusCode, message, data);
  }
}

// Distinct error class for network/offline situations. Treated as statusCode 0 by handlers.
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export const handleApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) {
    return error;
  }

  // NetworkError -> map to statusCode 0 (offline/transient network issue)
  if (error instanceof NetworkError) {
    return new ApiError(0, error.message);
  }

  // Axios network errors (no response + ERR_NETWORK) should also map to statusCode 0
  if (error instanceof AxiosError) {
    if (!error.response && error.code === 'ERR_NETWORK') {
      return new ApiError(0, error.message || 'Network error');
    }

    return ApiError.fromAxiosError(error);
  }

  if (error instanceof Error) {
    return new ApiError(500, error.message);
  }

  return new ApiError(500, 'An unexpected error occurred');
};

export const redirectToErrorPage = (statusCode: number): void => {
  const errorPath = `/error/${statusCode}`;

  // Use replace to avoid adding to history
  if (window.location.pathname !== errorPath) {
    window.location.replace(errorPath);
  }
};

export const getErrorMessage = (error: unknown): string => {
  const apiError = handleApiError(error);
  return apiError.message;
};

export const isNetworkError = (error: unknown): boolean => {
  if (error instanceof AxiosError) {
    return !error.response && error.code === 'ERR_NETWORK';
  }
  return false;
};

export const isTimeoutError = (error: unknown): boolean => {
  if (error instanceof AxiosError) {
    return error.code === 'ECONNABORTED' || error.response?.status === 408;
  }
  return false;
};

// Error message formatting for user display
export const formatErrorMessage = (error: unknown): string => {
  const apiError = handleApiError(error);

  switch (apiError.statusCode) {
    case 400:
      return 'Invalid request. Please check your input and try again.';
    case 401:
      return 'Authentication required. Please sign in to continue.';
    case 403:
      return "You don't have permission to perform this action.";
    case 404:
      return 'The requested resource was not found.';
    case 408:
      return 'Request timeout. Please check your connection and try again.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
      return 'Server error. Please try again later.';
    case 502:
      return 'Bad gateway. The server is temporarily unavailable.';
    case 503:
      return "Service unavailable. We're working to restore service.";
    case 504:
      return 'Gateway timeout. The server is taking too long to respond.';
    default:
      return apiError.message || 'An unexpected error occurred.';
  }
};

// Helper to determine if error should show error page vs inline error
export const shouldShowErrorPage = (error: unknown): boolean => {
  const apiError = handleApiError(error);

  // Show error page for these status codes
  const errorPageCodes = [403, 404, 500, 502, 503, 504];
  return errorPageCodes.includes(apiError.statusCode);
};

// Helper to get user-friendly error title
export const getErrorTitle = (statusCode: number): string => {
  switch (statusCode) {
    case 400:
      return 'Bad Request';
    case 401:
      return 'Authentication Required';
    case 403:
      return 'Access Forbidden';
    case 404:
      return 'Not Found';
    case 408:
      return 'Request Timeout';
    case 429:
      return 'Too Many Requests';
    case 500:
      return 'Internal Server Error';
    case 502:
      return 'Bad Gateway';
    case 503:
      return 'Service Unavailable';
    case 504:
      return 'Gateway Timeout';
    default:
      return 'Error';
  }
};
