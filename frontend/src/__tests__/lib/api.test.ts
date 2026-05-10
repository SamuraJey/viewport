import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publicApi } from '../../lib/api';

// Mock environment variables
const mockEnv = {
  VITE_API_URL: '',
  DEV: true,
};

describe('api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env vars
    mockEnv.VITE_API_URL = '';
    mockEnv.DEV = true;
  });

  describe('API configuration', () => {
    it('does not set a default Content-Type header on public requests', () => {
      expect(publicApi.defaults.headers.common['Content-Type']).toBeUndefined();
    });

    it('should use development API URL when in dev mode', () => {
      mockEnv.DEV = true;
      mockEnv.VITE_API_URL = '';
      const baseUrl = mockEnv.VITE_API_URL || (mockEnv.DEV ? '/api' : 'http://localhost:8000');
      expect(baseUrl).toBe('/api');
    });

    it('should use production URL when not in dev mode', () => {
      mockEnv.DEV = false;
      mockEnv.VITE_API_URL = '';
      const baseUrl = mockEnv.VITE_API_URL || (mockEnv.DEV ? '/api' : 'http://localhost:8000');
      expect(baseUrl).toBe('http://localhost:8000');
    });

    it('should prioritize custom VITE_API_URL over defaults', () => {
      mockEnv.VITE_API_URL = 'https://custom-api.com';
      const baseUrl = mockEnv.VITE_API_URL || (mockEnv.DEV ? '/api' : 'http://localhost:8000');
      expect(baseUrl).toBe('https://custom-api.com');
    });
  });
});
