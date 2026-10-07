import { useEffect, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeferredLenis } from '../../components/DeferredLenis';

const { create, destroy } = vi.hoisted(() => ({ create: vi.fn(), destroy: vi.fn() }));
vi.mock('lenis', () => ({
  default: class {
    constructor(options: unknown) {
      create(options);
    }
    destroy = destroy;
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('DeferredLenis', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
  });
  it('preserves mounted children and their state when scrolling enhancement loads, then cleans up', async () => {
    const mounted = vi.fn();
    const Child = () => {
      const [count, setCount] = useState(0);
      useEffect(() => {
        mounted();
      }, []);
      return <button onClick={() => setCount(count + 1)}>Count {count}</button>;
    };
    const { unmount } = render(
      <DeferredLenis>
        <Child />
      </DeferredLenis>,
    );
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ autoRaf: true }));
    expect(screen.getByRole('button')).toHaveTextContent('Count 1');
    expect(mounted).toHaveBeenCalledTimes(1);
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it.each(['(prefers-reduced-motion: reduce)', '(pointer: coarse)'])(
    'keeps native scrolling for %s',
    async (preference) => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({ matches: query === preference })),
      );
      render(
        <DeferredLenis>
          <main>Page content</main>
        </DeferredLenis>,
      );
      expect(screen.getByText('Page content')).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(create).not.toHaveBeenCalled();
    },
  );
});
