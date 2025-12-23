import { renderHook, act } from '@testing-library/react';
import { useSelection } from '../../hooks/useSelection';

describe('useSelection', () => {
    it('toggles selection and tracks count', () => {
        const { result } = renderHook(() => useSelection<string>());

        act(() => {
            result.current.toggle('a');
        });
        expect(result.current.isSelected('a')).toBe(true);
        expect(result.current.count).toBe(1);

        act(() => {
            result.current.toggle('a');
        });
        expect(result.current.hasSelection).toBe(false);
        expect(result.current.count).toBe(0);
    });

    it('supports range selection and single-select mode', () => {
        const ids = ['a', 'b', 'c', 'd', 'e'];
        const { result } = renderHook(() => useSelection({ initialSelected: ['a'] }));

        act(() => {
            result.current.toggle('b');
        });

        act(() => {
            result.current.selectRange('d', ids);
        });

        expect(Array.from(result.current.selectedIds)).toEqual(['a', 'b', 'c', 'd']);

        act(() => {
            result.current.clear();
        });
        expect(result.current.selectedIds.size).toBe(0);

        const { result: singleSelect } = renderHook(() => useSelection({ multiple: false }));

        act(() => {
            singleSelect.current.toggle('x');
            singleSelect.current.toggle('y');
        });

        expect(singleSelect.current.selectedIds.has('x')).toBe(false);
        expect(singleSelect.current.selectedIds.has('y')).toBe(true);
        expect(singleSelect.current.count).toBe(1);
    });
});
