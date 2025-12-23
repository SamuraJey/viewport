/**
 * Common types shared across multiple domains
 */

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
}

export type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};
