import { useEffect } from 'react';

export const useDocumentTitle = (title: string) => {
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.title = title;
  }, [title]);
};
