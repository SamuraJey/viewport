import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { usePagination } from '../../hooks/usePagination';

describe('usePagination', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

    it('manages local pagination state', () => {
        const { result } = renderHook(() => usePagination({ initialPage: 1, pageSize: 10 }), {
            wrapper,
        });

        act(() => {
            result.current.setTotal(50);
        });

        expect(result.current.totalPages).toBe(5);
        expect(result.current.hasMore).toBe(true);

        act(() => {
            result.current.goToPage(4);
        });
        expect(result.current.page).toBe(4);

        act(() => {
            result.current.nextPage();
        });
        expect(result.current.page).toBe(5);
        expect(result.current.hasMore).toBe(false);

        act(() => {
            result.current.previousPage();
        });
        expect(result.current.page).toBe(4);

        act(() => {
            result.current.reset();
        });
        expect(result.current.page).toBe(1);
        expect(result.current.total).toBe(0);
    });

    it('syncs pagination with URL search params', () => {
        const syncWrapper = ({ children }: { children: ReactNode }) => (
            <MemoryRouter initialEntries={['/items?page=2']}>{children}</MemoryRouter>
        );

        const { result } = renderHook(() => usePagination({ syncWithUrl: true }), {
            wrapper: syncWrapper,
        });

        expect(result.current.page).toBe(2);

        act(() => {
            result.current.setTotal(60);
        });

        act(() => {
            result.current.nextPage();
        });
        expect(result.current.page).toBe(3);

        act(() => {
            result.current.goToPage(10);
        });
        expect(result.current.page).toBe(3);

        act(() => {
            result.current.firstPage();
        });
        expect(result.current.page).toBe(1);
        expect(result.current.isFirstPage).toBe(true);
    });
});
