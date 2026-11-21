import { describe, it, expect, vi } from 'vitest';
import { cn, validateEmail, validatePassword, formatDateOnly, formatFileSize } from '../../lib/utils';

describe('utils', () => {
  it('preserves a date-only calendar date west of UTC while timestamps use local time', () => {
    const DateTimeFormat = Intl.DateTimeFormat;
    const formatter = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (locale, options) {
      return new DateTimeFormat(locale, { timeZone: 'America/Los_Angeles', ...options });
    });
    try {
      expect(formatDateOnly('2026-07-19')).toBe('Jul 19, 2026');
      expect(formatDateOnly('2026-07-19T00:00:00Z')).toBe('Jul 18, 2026');
      expect(formatDateOnly(new Date('2026-07-19T00:00:00Z'))).toBe('Jul 18, 2026');
    } finally {
      formatter.mockRestore();
    }
  });

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
      expect(validateEmail('fgg@fd.5')).toBe(false);
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
    it('formats a tebibyte and larger values with a valid unit', () => {
      expect(formatFileSize(1024 ** 4)).toBe('1 TB');
      expect(formatFileSize(1.5 * 1024 ** 4)).toBe('1.5 TB');
      expect(formatFileSize(1024 ** 5)).toBe('1024 TB');
    });
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
});
