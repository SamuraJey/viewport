import { useEffect } from 'react';
import { useThemeStore } from '../stores/themeStore';

/**
 * Theme initializer component that ensures theme is applied on app start
 * This should be placed early in the component tree
 */
export const ThemeInitializer = () => {
  const { setHydrated, preference, syncSystemTheme } = useThemeStore();

  useEffect(() => {
    // Mark as hydrated on mount
    setHydrated(true);
  }, [setHydrated]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    if (preference !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      syncSystemTheme();
    };

    syncSystemTheme();

    mediaQuery.addEventListener('change', handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, [preference, syncSystemTheme]);

  // This component doesn't render anything
  return null;
};
