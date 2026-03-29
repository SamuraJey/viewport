import { describe, expect, it } from 'vitest';
import {
  formatUtcDateTimeInputValue,
  parseUtcDateTimeInputValue,
} from '../../../components/share-links/shareLinkDateTime';

describe('shareLinkDateTime', () => {
  it('round-trips a UTC expiration without timezone drift', () => {
    const backendValue = '2026-03-29T15:00:00';

    const inputValue = formatUtcDateTimeInputValue(backendValue);

    expect(inputValue).toBe('2026-03-29T15:00');
    expect(parseUtcDateTimeInputValue(inputValue)).toBe('2026-03-29T15:00:00.000Z');
  });

  it('accepts timezone-aware values as UTC input', () => {
    expect(formatUtcDateTimeInputValue('2026-03-29T15:00:00Z')).toBe('2026-03-29T15:00');
    expect(formatUtcDateTimeInputValue('2026-03-29T15:00:00+00:00')).toBe('2026-03-29T15:00');
  });
});
