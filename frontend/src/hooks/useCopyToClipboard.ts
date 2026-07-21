import { useCallback, useEffect, useRef, useState } from 'react';

import { copyTextToClipboard } from '../lib/clipboard';

export const useCopyToClipboard = (resetDelay = 2000) => {
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResetTimeout = useCallback(() => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearResetTimeout();
    setCopied(false);
  }, [clearResetTimeout]);

  const copy = useCallback(
    async (text: string) => {
      if (!text || !(await copyTextToClipboard(text))) {
        return false;
      }

      clearResetTimeout();
      setCopied(true);
      resetTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        resetTimeoutRef.current = null;
      }, resetDelay);
      return true;
    },
    [clearResetTimeout, resetDelay],
  );

  useEffect(() => clearResetTimeout, [clearResetTimeout]);

  return { copied, copy, reset };
};
