import { useTheme } from '../hooks/useTheme';
import { Sun, Moon } from 'lucide-react';
import { useState } from 'react';
import { AppSwitch } from './ui';

type ThemeSwitchVariant = 'floating' | 'inline';

interface ThemeSwitchProps {
  className?: string;
  variant?: ThemeSwitchVariant;
}

export const ThemeSwitch = ({ className = '', variant = 'floating' }: ThemeSwitchProps) => {
  const { theme, setTheme } = useTheme();
  const [isAnimating, setIsAnimating] = useState(false);

  const handleToggle = (checked: boolean) => {
    if (isAnimating) return;
    setIsAnimating(true);
    setTheme(checked ? 'dark' : 'light');
    setTimeout(() => setIsAnimating(false), 400); // Синхронизировано с длительностью анимации темы
  };

  const baseClasses =
    'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-border/50 dark:border-border/50 transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50 disabled:cursor-not-allowed';
  const variantClasses =
    variant === 'floating'
      ? 'fixed top-4 right-4 z-50 bg-surface/80 dark:bg-surface/80 backdrop-blur-md shadow-lg hover:shadow-xl hover:scale-110'
      : 'relative z-auto h-10 w-10 bg-surface-1 dark:bg-surface-dark-1 shadow-sm hover:shadow-md hover:-translate-y-0.5';

  return (
    <AppSwitch
      checked={theme === 'dark'}
      onChange={handleToggle}
      disabled={isAnimating}
      className={`${baseClasses} ${variantClasses} ${className}`}
      showThumb={false}
      aria-label="Dark mode"
    >
      <div className={`${isAnimating ? 'animate-spin-once' : ''}`}>
        {theme === 'dark' ? (
          <Sun className="h-5 w-5 text-yellow-500 fill-yellow-500/20" />
        ) : (
          <Moon className="h-5 w-5 text-indigo-600 fill-indigo-600/10" />
        )}
      </div>
    </AppSwitch>
  );
};
