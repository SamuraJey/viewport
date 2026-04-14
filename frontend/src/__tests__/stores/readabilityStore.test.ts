import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReadabilityStore } from '../../stores/readabilityStore';

describe('readabilityStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(window.localStorage.setItem).mockClear();
    document.documentElement.removeAttribute('data-readability-mode');
    document.documentElement.removeAttribute('data-readability-contrast');
    document.documentElement.removeAttribute('data-readability-font-scale');
    document.documentElement.removeAttribute('data-readability-line-spacing');
    useReadabilityStore.setState({
      enabled: false,
      contrast: 'black-on-white',
      fontScale: '100',
      lineSpacing: 'normal',
      isHydrated: false,
    });
  });

  it('persists preferences and applies DOM attributes', () => {
    act(() => {
      useReadabilityStore.getState().setEnabled(true);
      useReadabilityStore.getState().setContrast('white-on-black');
      useReadabilityStore.getState().setFontScale('150');
      useReadabilityStore.getState().setLineSpacing('spacious');
    });

    expect(document.documentElement.dataset.readabilityMode).toBe('on');
    expect(document.documentElement.dataset.readabilityContrast).toBe('white-on-black');
    expect(document.documentElement.dataset.readabilityFontScale).toBe('150');
    expect(document.documentElement.dataset.readabilityLineSpacing).toBe('spacious');

    const latestPersistenceCall = vi.mocked(window.localStorage.setItem).mock.calls.at(-1);
    expect(latestPersistenceCall?.[0]).toBe('readability-preferences');
    expect(JSON.parse(latestPersistenceCall?.[1] || '{}')).toMatchObject({
      enabled: true,
      contrast: 'white-on-black',
      fontScale: '150',
      lineSpacing: 'spacious',
    });
  });

  it('does not auto-enable low-vision mode when updating presets only', () => {
    act(() => {
      useReadabilityStore.getState().setContrast('white-on-black');
      useReadabilityStore.getState().setFontScale('150');
      useReadabilityStore.getState().setLineSpacing('spacious');
    });

    expect(useReadabilityStore.getState().enabled).toBe(false);
    expect(document.documentElement.dataset.readabilityMode).toBe('off');

    const latestPersistenceCall = vi.mocked(window.localStorage.setItem).mock.calls.at(-1);
    expect(JSON.parse(latestPersistenceCall?.[1] || '{}')).toMatchObject({
      enabled: false,
      contrast: 'white-on-black',
      fontScale: '150',
      lineSpacing: 'spacious',
    });
  });
});
