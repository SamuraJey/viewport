import { act } from '@testing-library/react';
import { vi } from 'vitest';
import { useThemeStore } from '../../stores/themeStore';

describe('themeStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.documentElement.className = '';
        useThemeStore.setState({ theme: 'dark', isHydrated: false });
    });

    it('sets theme and applies DOM classes', () => {
        act(() => {
            useThemeStore.getState().setTheme('light');
        });

        expect(useThemeStore.getState().theme).toBe('light');
        expect(document.documentElement.classList.contains('light')).toBe(true);
        expect(window.localStorage.setItem).toHaveBeenCalledWith('theme', 'light');
    });

    it('toggles theme and updates hydration flag', () => {
        act(() => {
            useThemeStore.getState().setTheme('light');
            useThemeStore.getState().toggleTheme();
            useThemeStore.getState().setHydrated(true);
        });

        expect(useThemeStore.getState().theme).toBe('dark');
        expect(useThemeStore.getState().isHydrated).toBe(true);
    });
});
