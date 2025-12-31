import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useAsync } from '../../hooks/useAsync';

describe('useAsync', () => {
  it('resolves data and triggers callbacks', async () => {
    const asyncFn = vi.fn().mockResolvedValue('ok');
    const onSuccess = vi.fn();
    const onComplete = vi.fn();

    const { result } = renderHook(() => useAsync(asyncFn, { onSuccess, onComplete }));

    await act(async () => {
      await result.current.execute('id' as unknown as string);
    });

    expect(asyncFn).toHaveBeenCalledWith('id');
    expect(result.current.data).toBe('ok');
    expect(result.current.loading).toBe(false);
    expect(onSuccess).toHaveBeenCalledWith('ok');
    expect(onComplete).toHaveBeenCalled();
  });

  it('handles errors and can reset state', async () => {
    const asyncFn = vi.fn().mockRejectedValue(new Error('boom'));
    const onError = vi.fn();
    const onComplete = vi.fn();

    const { result } = renderHook(() => useAsync(asyncFn, { onError, onComplete }));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.error).toBe('boom');
    expect(onError).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();

    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('auto-executes when immediate is true', async () => {
    const asyncFn = vi.fn().mockResolvedValue('ready');

    const { result } = renderHook(() => useAsync(asyncFn, { immediate: true }));

    await waitFor(() => {
      expect(asyncFn).toHaveBeenCalled();
      expect(result.current.data).toBe('ready');
      expect(result.current.loading).toBe(false);
    });
  });
});
