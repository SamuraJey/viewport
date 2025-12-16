import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cn,
  formatDate,
  validateEmail,
  validatePassword,
  formatFileSize,
  copyToClipboard,
} from '../../lib/utils';

describe('utils', () => {
  describe('cn', () => {
    it('should combine class names correctly', () => {
      expect(cn('class1', 'class2')).toBe('class1 class2');
    });

    it('should handle conditional classes', () => {
      expect(cn('class1', true && 'class2', false && 'class3')).toBe('class1 class2');
    });

    it('should handle empty inputs', () => {
      expect(cn()).toBe('');
    });
  });

  describe('formatDate', () => {
    it('should format Date object correctly', () => {
      const date = new Date('2025-01-15T10:30:00Z');
      const formatted = formatDate(date);
      expect(formatted).toMatch(/Jan 15, 2025/);
    });

    it('should format date string correctly', () => {
      const dateString = '2025-01-15T10:30:00Z';
      const formatted = formatDate(dateString);
      expect(formatted).toMatch(/Jan 15, 2025/);
    });

    it('should include time in formatted date', () => {
      const date = new Date('2025-01-15T10:30:00Z');
      const formatted = formatDate(date);
      expect(formatted).toMatch(/\d{1,2}:\d{2}/);
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name+tag@domain.co.uk')).toBe(true);
      expect(validateEmail('user123@test-domain.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
      expect(validateEmail('@domain.com')).toBe(false);
      expect(validateEmail('test.domain.com')).toBe(false);
      expect(validateEmail('')).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('should validate strong passwords', () => {
      const result = validatePassword('strongpassword123');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject short passwords', () => {
      const result = validatePassword('short');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('should accept 8 character passwords', () => {
      const result = validatePassword('12345678');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(500)).toBe('500 Bytes');
      expect(formatFileSize(1023)).toBe('1023 Bytes');
    });

    it('should format kilobytes correctly', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(2048)).toBe('2 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatFileSize(1024 * 1024 * 1024 * 1.5)).toBe('1.5 GB');
    });
  });

  describe('copyToClipboard', () => {
    beforeEach(() => {
      // Reset mocks before each test
      vi.clearAllMocks();
    });

    it('should use modern clipboard API when available', async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        configurable: true,
      });

      const result = await copyToClipboard('test text');

      expect(result).toBe(true);
      expect(mockWriteText).toHaveBeenCalledWith('test text');
    });

    it('should fallback to execCommand when clipboard API is not available', async () => {
      // Mock navigator.clipboard as undefined
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        configurable: true,
      });

      // Mock document methods
      const mockTextArea = {
        value: '',
        focus: vi.fn(),
        select: vi.fn(),
      };
      const mockAppendChild = vi.fn();
      const mockRemoveChild = vi.fn();
      const mockCreateElement = vi.fn().mockReturnValue(mockTextArea);
      const mockExecCommand = vi.fn().mockReturnValue(true);

      Object.defineProperty(document, 'createElement', {
        value: mockCreateElement,
        configurable: true,
      });
      Object.defineProperty(document.body, 'appendChild', {
        value: mockAppendChild,
        configurable: true,
      });
      Object.defineProperty(document.body, 'removeChild', {
        value: mockRemoveChild,
        configurable: true,
      });
      Object.defineProperty(document, 'execCommand', {
        value: mockExecCommand,
        configurable: true,
      });

      const result = await copyToClipboard('test text');

      expect(result).toBe(true);
      expect(mockCreateElement).toHaveBeenCalledWith('textarea');
      expect(mockTextArea.value).toBe('test text');
      expect(mockTextArea.focus).toHaveBeenCalled();
      expect(mockTextArea.select).toHaveBeenCalled();
      expect(mockExecCommand).toHaveBeenCalledWith('copy');
      expect(mockAppendChild).toHaveBeenCalledWith(mockTextArea);
      expect(mockRemoveChild).toHaveBeenCalledWith(mockTextArea);
    });

    it('should handle errors and return false', async () => {
      const mockWriteText = vi.fn().mockRejectedValue(new Error('Permission denied'));
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        configurable: true,
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await copyToClipboard('test text');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to copy text: ', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });
});
