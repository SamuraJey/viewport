import { create } from 'zustand';

type Theme = 'light' | 'dark';
type ThemePreference = Theme | 'system';

const THEME_PREFERENCE_KEY = 'theme-preference';

interface ThemeState {
  theme: Theme;
  preference: ThemePreference;
  isHydrated: boolean;
  setTheme: (preference: ThemePreference) => void;
  toggleTheme: () => void;
  setHydrated: (hydrated: boolean) => void;
  syncSystemTheme: () => void;
}

const getSystemTheme = (): Theme => {
  if (typeof window === 'undefined') return 'dark';

  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

const resolveTheme = (preference: ThemePreference): Theme =>
  preference === 'system' ? getSystemTheme() : preference;

const disableTransitionsDuringThemeChange = () => {
  if (typeof window === 'undefined') return () => {};

  const style = document.createElement('style');
  style.appendChild(
    document.createTextNode(
      `*, *::before, *::after {
        transition-property: none !important;
        transition-duration: 0s !important;
        animation-duration: 0s !important;
      }`,
    ),
  );

  document.head.appendChild(style);

  return () => {
    void window.getComputedStyle(document.body);

    requestAnimationFrame(() => {
      style.remove();
    });
  };
};

const getInitialPreference = (): ThemePreference => {
  if (typeof window === 'undefined') return 'system';

  const storedPreference = localStorage.getItem(THEME_PREFERENCE_KEY);
  if (
    storedPreference === 'light' ||
    storedPreference === 'dark' ||
    storedPreference === 'system'
  ) {
    return storedPreference;
  }

  return 'system';
};

const initialPreference = getInitialPreference();

// Helper function to apply theme to DOM with smooth transition
const applyTheme = (theme: Theme, smooth = true) => {
  if (typeof window === 'undefined') return;

  const restoreTransitions = disableTransitionsDuringThemeChange();

  const updateTheme = () => {
    // Remove any existing theme classes first
    document.documentElement.classList.remove('dark', 'light');

    // Add the new theme class
    document.documentElement.classList.add(theme);

    restoreTransitions();
  };

  // Check if View Transitions API is supported
  const supportsViewTransitions = 'startViewTransition' in document;

  if (smooth && supportsViewTransitions) {
    try {
      // TODO fix maybe later
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = document as any;
      if (typeof doc.startViewTransition === 'function') {
        const transition = doc.startViewTransition(() => {
          updateTheme();
        });

        // Wait for the transition to be ready
        transition.ready
          .then(() => {})
          .catch((err: Error) => {
            // AbortError is expected if another transition starts
            if (err.name !== 'AbortError') {
              console.warn('🎨 View transition failed:', err);
            }
          });
      } else {
        updateTheme();
      }
    } catch (err) {
      console.warn('🎨 View transition API error:', err);
      updateTheme(); // Fallback to immediate update
    }
  } else {
    // Fallback or immediate update
    updateTheme();
  }
};

export const useThemeStore = create<ThemeState>()((set, get) => ({
  theme: resolveTheme(initialPreference),
  preference: initialPreference,
  isHydrated: false,
  setTheme: (preference: ThemePreference) => {
    const resolvedTheme = resolveTheme(preference);
    const { theme: currentTheme, preference: currentPreference, isHydrated } = get();

    if (currentTheme === resolvedTheme && currentPreference === preference && isHydrated) return;

    set({ theme: resolvedTheme, preference });
    localStorage.setItem(THEME_PREFERENCE_KEY, preference);
    applyTheme(resolvedTheme, true);
  },
  toggleTheme: () => {
    const currentTheme = get().theme;
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    get().setTheme(newTheme);
  },
  setHydrated: (hydrated: boolean) => {
    set({ isHydrated: hydrated });
  },
  syncSystemTheme: () => {
    const { preference, theme } = get();
    if (preference !== 'system') return;

    const nextTheme = getSystemTheme();
    if (theme === nextTheme) return;

    set({ theme: nextTheme });
    applyTheme(nextTheme, false);
  },
}));

// Apply default theme immediately for initial load without animation
if (typeof window !== 'undefined') {
  applyTheme(resolveTheme(initialPreference), false);
}
