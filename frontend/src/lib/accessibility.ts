export const MAIN_CONTENT_ID = 'main-content';

const firstNonEmpty = (values: Array<string | null | undefined>): string | null => {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
};

type AccessiblePhotoNameInput =
  | {
      displayName?: string | null;
      filename?: string | null;
    }
  | null
  | undefined;

export const getAccessiblePhotoName = (input: AccessiblePhotoNameInput): string => {
  const { displayName, filename } = input ?? {};
  const primary = firstNonEmpty([displayName, filename]);
  if (primary) {
    return primary;
  }

  return 'Gallery photo';
};

export const createFieldMessageId = (fieldId: string, suffix: string) => `${fieldId}-${suffix}`;

export const formatDocumentTitle = (pageTitle: string) => `${pageTitle} · Viewport`;
