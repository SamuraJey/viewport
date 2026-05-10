import { describe, expect, it } from 'vitest';

import { getAvatarInitials, stringToHue } from '../../lib/avatar';

describe('avatar utilities', () => {
  it('derives readable initials from names, emails, and empty values', () => {
    expect(getAvatarInitials('Sam Rivera', 'sam@example.com')).toBe('SR');
    expect(getAvatarInitials('', 'client.photo@example.com')).toBe('CP');
    expect(getAvatarInitials('A', null)).toBe('A');
    expect(getAvatarInitials('', '')).toBe('?');
  });

  it('returns a stable hue within the CSS hue range', () => {
    const first = stringToHue('sam@example.com');
    const second = stringToHue('sam@example.com');

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(360);
  });
});
