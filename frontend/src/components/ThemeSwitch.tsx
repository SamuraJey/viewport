import { useTheme } from '../hooks/useTheme';
import { Sun, Moon } from 'lucide-react';
import { useState } from 'react';

type ThemeSwitchVariant = 'floating' | 'inline';

interface ThemeSwitchProps {
  className?: string;
  variant?: ThemeSwitchVariant;
}

export const ThemeSwitch = ({ className = '', variant = 'floating' }: ThemeSwitchProps) => {
  const { theme, toggleTheme } = useTheme();
  const [isAnimating, setIsAnimating] = useState(false);

  const handleToggle = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    toggleTheme();
    setTimeout(() => setIsAnimating(false), 400); // Синхронизировано с длительностью анимации темы
  };

  const baseClasses =
    'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-border dark:border-border transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  const variantClasses =
    variant === 'floating'
      ? 'fixed top-4 right-4 z-50 bg-surface dark:bg-surface shadow-lg hover:shadow-xl hover:scale-110'
      : 'relative z-auto bg-surface-1 dark:bg-surface-dark-1 shadow-sm hover:shadow-md hover:-translate-y-0.5';

  return (
    <button
      onClick={handleToggle}
      disabled={isAnimating}
      className={`${baseClasses} ${variantClasses} ${className}`}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <div className={`${isAnimating ? 'animate-spin-once' : ''}`}>
        {theme === 'dark' ? (
          <Sun className="h-5 w-5 text-yellow-400" />
        ) : (
          <Moon className="h-5 w-5 text-yellow-400" />
        )}
      </div>
    </button>
  );
};
