import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { ThemeInitializer } from '../../components/ThemeInitializer';
import { useThemeStore } from '../../stores/themeStore';

vi.mock('../../stores/themeStore', () => ({
  useThemeStore: vi.fn(() => ({ setHydrated: vi.fn() })),
}));

describe('ThemeInitializer', () => {
  it('marks theme store as hydrated on mount', () => {
    const setHydrated = vi.fn();
    const syncSystemTheme = vi.fn();
    const mockedUseThemeStore = useThemeStore as unknown as any;
    mockedUseThemeStore.mockReturnValue({
      setHydrated,
      preference: 'dark',
      syncSystemTheme,
    });

    render(<ThemeInitializer />);

    expect(setHydrated).toHaveBeenCalledWith(true);
    expect(syncSystemTheme).not.toHaveBeenCalled();
  });

  it('subscribes to system changes when preference is system', () => {
    const setHydrated = vi.fn();
    const syncSystemTheme = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const mockedUseThemeStore = useThemeStore as unknown as any;

    mockedUseThemeStore.mockReturnValue({
      setHydrated,
      preference: 'system',
      syncSystemTheme,
    });

    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener,
      removeEventListener,
    }));

    const { unmount } = render(<ThemeInitializer />);

    expect(syncSystemTheme).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
