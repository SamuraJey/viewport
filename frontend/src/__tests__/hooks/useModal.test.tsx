import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useModal } from '../../hooks/useModal';

describe('useModal', () => {
    it('opens and closes with data', () => {
        const onOpen = vi.fn();
        const onClose = vi.fn();

        const { result } = renderHook(() => useModal<string>({ onOpen, onClose }));

        act(() => {
            result.current.open('item-1');
        });

        expect(result.current.isOpen).toBe(true);
        expect(result.current.data).toBe('item-1');
        expect(onOpen).toHaveBeenCalledWith('item-1');

        act(() => {
            result.current.close();
        });

        expect(result.current.isOpen).toBe(false);
        expect(result.current.data).toBeNull();
        expect(onClose).toHaveBeenCalled();
    });

    it('toggles modal state when no data provided', () => {
        const { result } = renderHook(() => useModal());

        act(() => {
            result.current.toggle();
        });
        expect(result.current.isOpen).toBe(true);
        expect(result.current.data).toBeNull();

        act(() => {
            result.current.toggle();
        });
        expect(result.current.isOpen).toBe(false);
    });
});
