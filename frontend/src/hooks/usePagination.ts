/**
 * usePagination - Reusable pagination hook
 *
 * Provides state management for pagination with optional URL sync.
 * Supports both traditional pagination and infinite scroll patterns.
 */

import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface UsePaginationOptions {
  /** Initial page (1-based) */
  initialPage?: number;
  /** Items per page */
  pageSize?: number;
  /** Sync pagination state with URL search params */
  syncWithUrl?: boolean;
  /** URL parameter name for page number (default: 'page') */
  urlParam?: string;
}

export interface PaginationState {
  /** Current page (1-based) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total number of items */
  total: number;
  /** Total number of pages */
  totalPages: number;
}

export interface PaginationActions {
  /** Go to specific page */
  goToPage: (page: number) => void;
  /** Go to next page */
  nextPage: () => void;
  /** Go to previous page */
  previousPage: () => void;
  /** Go to first page */
  firstPage: () => void;
  /** Go to last page */
  lastPage: () => void;
  /** Set total number of items */
  setTotal: (total: number) => void;
  /** Reset pagination to initial state */
  reset: () => void;
  /** Check if there are more pages */
  hasMore: boolean;
  /** Check if on first page */
  isFirstPage: boolean;
  /** Check if on last page */
  isLastPage: boolean;
}

export interface UsePaginationReturn extends PaginationState, PaginationActions {}

const toPositiveInteger = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
};

const parsePageParam = (value: string | null, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  return toPositiveInteger(Number.parseInt(value, 10), fallback);
};

/**
 * Hook for managing pagination state
 *
 * @example
 * // Basic usage
 * const pagination = usePagination({ pageSize: 20 });
 *
 * @example
 * // With URL sync
 * const pagination = usePagination({
 *   pageSize: 100,
 *   syncWithUrl: true
 * });
 *
 * @example
 * // Infinite scroll pattern
 * const pagination = usePagination({ pageSize: 50 });
 * if (pagination.hasMore) {
 *   pagination.nextPage();
 * }
 */
export function usePagination(options: UsePaginationOptions = {}): UsePaginationReturn {
  const {
    initialPage = 1,
    pageSize: initialPageSize = 20,
    syncWithUrl = false,
    urlParam = 'page',
  } = options;

  const normalizedInitialPage = toPositiveInteger(initialPage, 1);
  const pageSize = toPositiveInteger(initialPageSize, 20);
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = syncWithUrl
    ? parsePageParam(searchParams.get(urlParam), normalizedInitialPage)
    : normalizedInitialPage;

  const [localPage, setLocalPage] = useState(normalizedInitialPage);
  const [total, setTotal] = useState(0);

  const page = syncWithUrl ? urlPage : localPage;

  const totalPages = useMemo(() => Math.ceil(total / pageSize), [total, pageSize]);
  const hasMore = page < totalPages;
  const isFirstPage = page === 1;
  const isLastPage = page >= totalPages && totalPages > 0;

  const goToPage = useCallback(
    (newPage: number) => {
      const requestedPage = toPositiveInteger(newPage, 1);
      const clampedPage = Math.max(1, Math.min(requestedPage, totalPages || requestedPage));

      if (syncWithUrl) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set(urlParam, clampedPage.toString());
        setSearchParams(nextParams);
      } else {
        setLocalPage(clampedPage);
      }
    },
    [syncWithUrl, totalPages, setSearchParams, searchParams, urlParam],
  );

  const nextPage = useCallback(() => {
    if (hasMore) {
      goToPage(page + 1);
    }
  }, [page, hasMore, goToPage]);

  const previousPage = useCallback(() => {
    if (page > 1) {
      goToPage(page - 1);
    }
  }, [page, goToPage]);

  const firstPage = useCallback(() => {
    goToPage(1);
  }, [goToPage]);

  const lastPage = useCallback(() => {
    if (totalPages > 0) {
      goToPage(totalPages);
    }
  }, [totalPages, goToPage]);

  const reset = useCallback(() => {
    goToPage(normalizedInitialPage);
    setTotal(0);
  }, [normalizedInitialPage, goToPage]);

  return useMemo(
    () => ({
      page,
      pageSize,
      total,
      totalPages,
      goToPage,
      nextPage,
      previousPage,
      firstPage,
      lastPage,
      setTotal,
      reset,
      hasMore,
      isFirstPage,
      isLastPage,
    }),
    [
      page,
      pageSize,
      total,
      totalPages,
      goToPage,
      nextPage,
      previousPage,
      firstPage,
      lastPage,
      setTotal,
      reset,
      hasMore,
      isFirstPage,
      isLastPage,
    ],
  );
}
