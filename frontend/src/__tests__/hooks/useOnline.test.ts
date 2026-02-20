import { renderHook, act } from '@testing-library/react';
import { useOnline } from '../../../src/hooks/useOnline';

describe('useOnline hook', () => {
  const realNavigator = { ...global.navigator } as any;

  afterEach(() => {
    Object.defineProperty(global, 'navigator', { value: realNavigator, configurable: true });
  });

  it('reflects navigator.onLine and responds to events', () => {
    Object.defineProperty(global, 'navigator', { value: { onLine: true }, configurable: true });

    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);

    // go offline
    Object.defineProperty(global, 'navigator', { value: { onLine: false }, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    // back online
    Object.defineProperty(global, 'navigator', { value: { onLine: true }, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});
