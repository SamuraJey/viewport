export const formatPublicGalleryDate = (value?: string | null): string => {
  if (!value) return '';

  const datePart = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (match) {
    const [, year, month, day] = match;
    return `${day}.${month}.${year}`;
  }

  return value;
};

export function clampFocal(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}
