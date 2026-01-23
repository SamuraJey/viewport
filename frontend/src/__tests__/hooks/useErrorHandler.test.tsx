import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useErrorHandler, useNetworkErrorHandler } from '../../hooks/useErrorHandler';

const mockHandleApiError = vi.fn();
const mockShouldShowErrorPage = vi.fn();
const mockFormatErrorMessage = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../../lib/errorHandling', () => ({
  handleApiError: (...args: unknown[]) => mockHandleApiError(...args),
  shouldShowErrorPage: (...args: unknown[]) => mockShouldShowErrorPage(...args),
  formatErrorMessage: (...args: unknown[]) => mockFormatErrorMessage(...args),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('useErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => { });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects to error page for critical errors', () => {
    mockHandleApiError.mockReturnValue({ statusCode: 404, message: 'not found' });
    mockShouldShowErrorPage.mockReturnValue(true);

    const { result } = renderHook(() => useErrorHandler());

    act(() => {
      result.current.handleError(new Error('boom'));
    });

    expect(mockNavigate).toHaveBeenCalledWith('/error/404', { replace: true });
    expect(result.current.error).toBeNull();
  });

  it('shows inline message for non-critical errors and clears on loading', () => {
    mockHandleApiError.mockReturnValue({ statusCode: 400, message: 'bad' });
    mockShouldShowErrorPage.mockReturnValue(false);
    mockFormatErrorMessage.mockImplementation((err) =>
      err instanceof Error ? `friendly: ${err.message}` : 'friendly',
    );

    const { result } = renderHook(() => useErrorHandler());

    act(() => {
      result.current.handleError(new Error('fail'));
    });

    expect(result.current.error).toBe('friendly: fail');

    act(() => {
      result.current.setLoading(true);
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
  });
});

describe('useNetworkErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => { });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes network errors to a friendly message', () => {
    mockHandleApiError.mockReturnValueOnce({ statusCode: 0, message: 'offline' }).mockReturnValue({
      statusCode: 500,
      message: 'No internet connection. Please check your network and try again.',
    });
    mockShouldShowErrorPage.mockReturnValue(false);
    mockFormatErrorMessage.mockImplementation((err) =>
      err instanceof Error ? err.message : 'formatted',
    );

    const { result } = renderHook(() => useNetworkErrorHandler());

    act(() => {
      result.current.handleError(new Error('network down'));
    });

    expect(result.current.error).toBe(
      'No internet connection. Please check your network and try again.',
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
