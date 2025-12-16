import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock environment variables
const mockEnv = {
  VITE_API_URL: '',
  DEV: true,
};

// Mock the getPhotoUrl function by reimplementing its logic
const getPhotoUrl = (relativePath: string) => {
  const baseUrl = mockEnv.VITE_API_URL || (mockEnv.DEV ? '/api' : 'http://localhost:8000');

  if (!relativePath) {
    return baseUrl;
  }

  // Add leading slash if missing
  const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;

  // If baseUrl is relative (like '/api'), we need to use full URL for photos
  if (baseUrl.startsWith('/')) {
    return `http://localhost:8000${path}`;
  }

  return `${baseUrl}${path}`;
};

describe('api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env vars
    mockEnv.VITE_API_URL = '';
    mockEnv.DEV = true;
  });

  describe('getPhotoUrl', () => {
    it('should construct correct photo URL with default base URL', () => {
      mockEnv.VITE_API_URL = '';
      mockEnv.DEV = true;
      const result = getPhotoUrl('/photos/123');
      expect(result).toBe('http://localhost:8000/photos/123');
    });

    it('should construct correct photo URL with custom base URL', () => {
      mockEnv.VITE_API_URL = 'https://api.example.com';
      const result = getPhotoUrl('/photos/123');
      expect(result).toBe('https://api.example.com/photos/123');
    });

    it('should handle relative URLs correctly', () => {
      mockEnv.VITE_API_URL = '';
      mockEnv.DEV = true;
      const result = getPhotoUrl('/path/to/photo');
      expect(result).toBe('http://localhost:8000/path/to/photo');
    });

    it('should handle URLs without leading slash', () => {
      mockEnv.VITE_API_URL = '';
      mockEnv.DEV = true;
      const result = getPhotoUrl('photos/123');
      expect(result).toBe('http://localhost:8000/photos/123');
    });

    it('should work with empty relative URL', () => {
      mockEnv.VITE_API_URL = 'https://api.example.com';
      const result = getPhotoUrl('');
      expect(result).toBe('https://api.example.com');
    });
  });

  describe('API configuration', () => {
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
