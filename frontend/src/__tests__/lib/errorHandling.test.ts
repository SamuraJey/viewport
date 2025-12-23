import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import {
    ApiError,
    handleApiError,
    formatErrorMessage,
    shouldShowErrorPage,
    isNetworkError,
    isTimeoutError,
    getErrorMessage,
} from '../../lib/errorHandling';

describe('errorHandling utilities', () => {
    it('wraps different error types into ApiError', () => {
        const apiErr = new ApiError(400, 'bad');
        expect(handleApiError(apiErr)).toBe(apiErr);

        const axiosError = new AxiosError('network fail', 'ERR_NETWORK', undefined, undefined, {
            status: 0,
            data: undefined,
            statusText: 'ERR_NETWORK',
            headers: {},
            config: {},
        } as any);
        const fromAxios = handleApiError(axiosError);
        expect(fromAxios).toBeInstanceOf(ApiError);

        const generic = handleApiError(new Error('boom'));
        expect(generic.statusCode).toBe(500);
    });

    it('formats messages by status code', () => {
        expect(formatErrorMessage(new ApiError(400, ''))).toContain('Invalid request');
        expect(formatErrorMessage(new ApiError(404, ''))).toContain('not found');
        expect(formatErrorMessage(new ApiError(503, ''))).toContain('Service unavailable');
        expect(formatErrorMessage(new ApiError(999, 'custom'))).toBe('custom');
    });

    it('detects network and timeout errors', () => {
        const networkError = new AxiosError('network', 'ERR_NETWORK');
        const timeoutError = new AxiosError('timeout', 'ECONNABORTED');

        expect(isNetworkError(networkError)).toBe(true);
        expect(isTimeoutError(timeoutError)).toBe(true);
    });

    it('reports if error page should be shown', () => {
        expect(shouldShowErrorPage(new ApiError(403, ''))).toBe(true);
        expect(shouldShowErrorPage(new ApiError(429, ''))).toBe(false);
    });

    it('returns user-facing error message', () => {
        const message = getErrorMessage(new ApiError(500, 'server down'));
        expect(message).toBe('server down');
    });
});
