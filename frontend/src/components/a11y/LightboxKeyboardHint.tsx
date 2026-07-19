import { useEffect, useState } from 'react';
import { Keyboard } from 'lucide-react';

interface LightboxKeyboardHintProps {
  isOpen: boolean;
}

const STORAGE_KEY = 'viewport:lightbox-hint-shown';
const HINT_DURATION_MS = 4000;

export const LightboxKeyboardHint = ({ isOpen }: LightboxKeyboardHintProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setVisible(false);
      return;
    }

    let alreadyShown = false;
    try {
      alreadyShown = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // localStorage can be disabled in private mode; treat as already shown.
    }

    if (alreadyShown) {
      return;
    }

    setVisible(true);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Ignore localStorage write failures.
    }

    const timer = window.setTimeout(() => {
      setVisible(false);
    }, HINT_DURATION_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isOpen]);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 rounded-full border border-white/20 bg-black/80 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-2"
    >
      <span className="inline-flex items-center gap-2">
        <Keyboard className="h-4 w-4" aria-hidden="true" />
        <span>← → to navigate • Esc to close</span>
      </span>
    </div>
  );
};
