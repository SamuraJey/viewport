/**
 * useAsync - Standardize async operation state management
 *
 * Provides consistent loading/error/data states for async operations,
 * replacing inline try-catch patterns.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { AsyncState } from '../types';

export interface UseAsyncOptions<TData> {
  /** Initial data value */
  initialData?: TData | null;
  /** Automatically execute on mount */
  immediate?: boolean;
  /** Callback on success */
  onSuccess?: (data: TData) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Callback on completion (success or error) */
  onComplete?: () => void;
}

export interface UseAsyncReturn<TData, TParams extends unknown[] = []> {
  /** Current data */
  data: TData | null;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Execute the async function */
  execute: (...params: TParams) => Promise<TData | null>;
  /** Reset to initial state */
  reset: () => void;
  /** Set data manually */
  setData: (data: TData | null) => void;
  /** Set error manually */
  setError: (error: string | null) => void;
  /** Full async state */
  state: AsyncState<TData>;
}

/**
 * Hook for managing async operations with loading/error/data state
 *
 * @example
 * // Basic usage
 * const { data, loading, error, execute } = useAsync(
 *   async (id: string) => {
 *     const response = await api.get(`/items/${id}`);
 *     return response.data;
 *   }
 * );
 *
 * @example
 * // With callbacks
 * const { execute } = useAsync(
 *   async () => await deletePhoto(photoId),
 *   {
 *     onSuccess: () => showToast('Deleted!'),
 *     onError: (err) => showToast(err.message),
 *   }
 * );
 *
 * @example
 * // Auto-execute on mount
 * const { data, loading } = useAsync(
 *   async () => await fetchUser(),
 *   { immediate: true }
 * );
 */
export function useAsync<TData, TParams extends unknown[] = []>(
  asyncFunction: (...params: TParams) => Promise<TData>,
  options: UseAsyncOptions<TData> = {},
): UseAsyncReturn<TData, TParams> {
  const { initialData = null, immediate = false, onSuccess, onError, onComplete } = options;

  const [data, setData] = useState<TData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track if component is mounted to avoid state updates after unmount
  const isMountedRef = useRef(true);
  const asyncFunctionRef = useRef(asyncFunction);

  // Update function ref when it changes
  useEffect(() => {
    asyncFunctionRef.current = asyncFunction;
  }, [asyncFunction]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const execute = useCallback(
    async (...params: TParams): Promise<TData | null> => {
      setLoading(true);
      setError(null);

      try {
        const result = await asyncFunctionRef.current(...params);

        if (isMountedRef.current) {
          setData(result);
          setLoading(false);
          onSuccess?.(result);
          onComplete?.();
        }

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';

        if (isMountedRef.current) {
          setError(errorMessage);
          setLoading(false);
          onError?.(err instanceof Error ? err : new Error(errorMessage));
          onComplete?.();
        }

        return null;
      }
    },
    [onSuccess, onError, onComplete],
  );

  const reset = useCallback(() => {
    setData(initialData);
    setLoading(false);
    setError(null);
  }, [initialData]);

  // Auto-execute on mount if immediate option is true
  useEffect(() => {
    if (immediate) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute(...([] as any));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immediate]);

  return {
    data,
    loading,
    error,
    execute,
    reset,
    setData,
    setError,
    state: { data, loading, error },
  };
}
