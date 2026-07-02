import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publicApi, resolveApiBaseUrl } from '../../lib/api';

const mockEnv = {
  VITE_API_URL: '',
  DEV: true,
  PROD: false,
};

describe('api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env vars
    mockEnv.VITE_API_URL = '';
    mockEnv.DEV = true;
    mockEnv.PROD = false;
  });

  describe('API configuration', () => {
    it('does not set a default Content-Type header on public requests', () => {
      expect(publicApi.defaults.headers.common['Content-Type']).toBeUndefined();
    });

    it('uses proxy API URL when in dev mode and VITE_API_URL is absent', () => {
      expect(resolveApiBaseUrl(mockEnv)).toBe('/api');
    });

    it('throws when production VITE_API_URL is absent', () => {
      mockEnv.DEV = false;
      mockEnv.PROD = true;
      mockEnv.VITE_API_URL = '';

      expect(() => resolveApiBaseUrl(mockEnv)).toThrow('VITE_API_URL is required');
    });

    it('rejects non-HTTPS production API URLs', () => {
      mockEnv.DEV = false;
      mockEnv.PROD = true;
      mockEnv.VITE_API_URL = 'http://api.example.com';

      expect(() => resolveApiBaseUrl(mockEnv)).toThrow('must use HTTPS');
    });

    it('uses HTTPS VITE_API_URL in production', () => {
      mockEnv.DEV = false;
      mockEnv.PROD = true;
      mockEnv.VITE_API_URL = 'https://custom-api.com';

      expect(resolveApiBaseUrl(mockEnv)).toBe('https://custom-api.com');
    });
  });
});
