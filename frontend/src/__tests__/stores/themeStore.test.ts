import { act } from '@testing-library/react';
import { vi } from 'vitest';
import { useThemeStore } from '../../stores/themeStore';

describe('themeStore', () => {
  const createMatchMedia = (matches: boolean) =>
    vi.fn().mockImplementation(() => ({
      matches,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.className = '';
    window.localStorage.getItem = vi.fn(() => null);
    window.matchMedia = createMatchMedia(false);
    useThemeStore.setState({
      theme: 'dark',
      preference: 'dark',
      isHydrated: false,
    });
  });

  it('sets theme and applies DOM classes', () => {
    act(() => {
      useThemeStore.getState().setTheme('light');
    });

    expect(useThemeStore.getState().theme).toBe('light');
    expect(useThemeStore.getState().preference).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(window.localStorage.setItem).toHaveBeenCalledWith('theme-preference', 'light');
  });

  it('toggles theme and updates hydration flag', () => {
    act(() => {
      useThemeStore.getState().setTheme('light');
      useThemeStore.getState().toggleTheme();
      useThemeStore.getState().setHydrated(true);
    });

    expect(useThemeStore.getState().theme).toBe('dark');
    expect(useThemeStore.getState().preference).toBe('dark');
    expect(useThemeStore.getState().isHydrated).toBe(true);
  });

  it('resolves and syncs system theme when preference is system', () => {
    window.matchMedia = createMatchMedia(true);

    act(() => {
      useThemeStore.getState().setTheme('system');
    });

    expect(useThemeStore.getState().preference).toBe('system');
    expect(useThemeStore.getState().theme).toBe('dark');

    window.matchMedia = createMatchMedia(false);

    act(() => {
      useThemeStore.getState().syncSystemTheme();
    });

    expect(useThemeStore.getState().theme).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
});
