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
    const mockedUseThemeStore = useThemeStore as unknown as vi.Mock;
    mockedUseThemeStore.mockReturnValue({ setHydrated });

    render(<ThemeInitializer />);

    expect(setHydrated).toHaveBeenCalledWith(true);
  });
});
