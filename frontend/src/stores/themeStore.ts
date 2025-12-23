import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  isHydrated: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setHydrated: (hydrated: boolean) => void;
}

// Helper function to apply theme to DOM with smooth transition
const applyTheme = (theme: Theme, smooth = true) => {
  if (typeof window === 'undefined') return;

  const updateTheme = () => {
    // Remove any existing theme classes first
    document.documentElement.classList.remove('dark', 'light');

    // Add the new theme class
    document.documentElement.classList.add(theme);

    // Sync with localStorage for the index.html script
    localStorage.setItem('theme', theme);
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

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark', // Default to dark theme
      isHydrated: false,
      setTheme: (theme: Theme) => {
        const currentTheme = get().theme;
        if (currentTheme === theme && get().isHydrated) return;
        set({ theme });
        applyTheme(theme, true);
      },
      toggleTheme: () => {
        const currentTheme = get().theme;
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        get().setTheme(newTheme);
      },
      setHydrated: (hydrated: boolean) => {
        set({ isHydrated: hydrated });
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme, false);
        } else {
          applyTheme('dark', false);
        }
      },
    },
  ),
);

// Apply default theme immediately for initial load without animation
if (typeof window !== 'undefined') {
  const savedTheme = localStorage.getItem('theme') as Theme | null;
  const systemTheme =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  applyTheme(savedTheme || systemTheme, false);
}
