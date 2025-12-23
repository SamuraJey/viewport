import { useEffect } from 'react';
import { useThemeStore } from '../stores/themeStore';

/**
 * Theme initializer component that ensures theme is applied on app start
 * This should be placed early in the component tree
 */
export const ThemeInitializer = () => {
  const { setHydrated } = useThemeStore();

  useEffect(() => {
    // Mark as hydrated on mount
    setHydrated(true);

    // We don't need to manually apply the theme here anymore
    // as themeStore handles it via persist middleware and applyTheme calls
  }, [setHydrated]);

  // This component doesn't render anything
  return null;
};
