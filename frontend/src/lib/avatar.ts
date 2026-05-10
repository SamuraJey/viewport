/** Returns up to two uppercase initials for a display name or email address. */
export const getAvatarInitials = (
  displayName?: string | null,
  email?: string | null,
  fallback = '?',
): string => {
  const source = displayName?.trim() || email?.trim() || '';
  if (!source) {
    return fallback;
  }

  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
};

/** Deterministic hue from a stable user identifier for generated avatar backgrounds. */
export const stringToHue = (value?: string | null): number => {
  const source = value?.trim() || 'user';
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) & 0xffffff;
  }

  return hash % 360;
};
