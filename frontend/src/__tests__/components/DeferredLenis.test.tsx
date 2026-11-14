import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeferredLenis } from '../../components/DeferredLenis';

const { created, destroyed } = vi.hoisted(() => ({ created: vi.fn(), destroyed: vi.fn() }));
vi.mock('lenis', () => ({
  default: class {
    constructor(options: unknown) {
      created(options);
    }
    destroy() {
      destroyed();
    }
  },
}));

describe('DeferredLenis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts scrolling without remounting content, resetting input or repeating effects', async () => {
    const mounted = vi.fn();
    const Page = () => {
      useEffect(mounted, []);
      return <input aria-label="Page draft" defaultValue="" />;
    };
    const { unmount } = render(
      <DeferredLenis>
        <Page />
      </DeferredLenis>,
    );
    const input = screen.getByRole('textbox', { name: 'Page draft' });
    fireEvent.change(input, { target: { value: 'Unsaved input' } });
    await waitFor(() => expect(created).toHaveBeenCalledWith({ autoRaf: true }));
    expect(mounted).toHaveBeenCalledOnce();
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Unsaved input');
    unmount();
    expect(destroyed).toHaveBeenCalledOnce();
  });

  it('does not initialize scrolling after unmount', async () => {
    const { unmount } = render(
      <DeferredLenis>
        <main>Page content</main>
      </DeferredLenis>,
    );
    unmount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(created).not.toHaveBeenCalled();
  });
});
