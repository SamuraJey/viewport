import { useRef, useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppDrawer } from '../../../components/ui';

const setDesktopViewport = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 768px)' ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

const DrawerHarness = ({ side }: { side?: 'left' | 'right' | 'bottom' }) => {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open editor
      </button>
      <AppDrawer
        open={open}
        onOpenChange={setOpen}
        side={side}
        title="Edit details"
        description="Drawer description"
        initialFocusRef={inputRef}
        footer={<button type="button">Save</button>}
      >
        <label htmlFor="drawer-name">Name</label>
        <input id="drawer-name" ref={inputRef} />
      </AppDrawer>
    </>
  );
};

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('AppDrawer', () => {
  it('opens as a bottom sheet on mobile, focuses content, closes on Escape, and restores focus', async () => {
    setDesktopViewport(false);
    const user = userEvent.setup();
    render(<DrawerHarness />);

    const trigger = screen.getByRole('button', { name: 'Open editor' });
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Edit details' });
    expect(dialog).toHaveAttribute('data-side', 'bottom');
    expect(screen.getByLabelText('Name')).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit details' })).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('uses the requested desktop side and width', async () => {
    setDesktopViewport(true);
    const user = userEvent.setup();
    render(<DrawerHarness side="left" />);

    await user.click(screen.getByRole('button', { name: 'Open editor' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit details' });
    expect(dialog).toHaveAttribute('data-side', 'left');
    expect(dialog).toHaveClass('left-0', 'md:w-[480px]');
  });

  it('defaults to a right-side panel on desktop and closes from the overlay', async () => {
    setDesktopViewport(true);
    const user = userEvent.setup();
    render(<DrawerHarness />);

    await user.click(screen.getByRole('button', { name: 'Open editor' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit details' });
    expect(dialog).toHaveAttribute('data-side', 'right');
    expect(dialog).toHaveClass('right-0', 'md:w-[480px]');

    const overlay = document.querySelector('[data-vaul-overlay]');
    expect(overlay).toBeInstanceOf(HTMLElement);
    await user.click(overlay as HTMLElement);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit details' })).toBeNull());
  });

  it('keeps keyboard focus inside the open drawer', async () => {
    setDesktopViewport(true);
    const user = userEvent.setup();
    render(<DrawerHarness />);

    const trigger = screen.getByRole('button', { name: 'Open editor' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Edit details' });

    for (let index = 0; index < 5; index += 1) await user.tab();

    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(trigger).not.toHaveFocus();
  });

  it('restores focus when an already-open drawer unmounts on close', async () => {
    setDesktopViewport(true);
    const user = userEvent.setup();

    const ConditionalHarness = () => {
      const [open, setOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open conditional editor
          </button>
          {open ? (
            <AppDrawer open onOpenChange={setOpen} title="Conditional editor">
              <input aria-label="Conditional field" />
            </AppDrawer>
          ) : null}
        </>
      );
    };

    render(<ConditionalHarness />);
    const trigger = screen.getByRole('button', { name: 'Open conditional editor' });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Conditional editor' });

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Conditional editor' })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('supports a nested drawer without closing its parent', async () => {
    setDesktopViewport(false);
    const user = userEvent.setup();

    const NestedHarness = () => {
      const [parentOpen, setParentOpen] = useState(true);
      const [childOpen, setChildOpen] = useState(false);

      return (
        <AppDrawer open={parentOpen} onOpenChange={setParentOpen} title="Parent drawer">
          <AppDrawer
            nested
            open={childOpen}
            onOpenChange={setChildOpen}
            title="Nested drawer"
            trigger={<button type="button">Open nested</button>}
          >
            Nested content
          </AppDrawer>
        </AppDrawer>
      );
    };

    render(<NestedHarness />);
    const parent = await screen.findByRole('dialog', { name: 'Parent drawer' });
    const parentCloseButton = within(parent).getByRole('button', { name: 'Close drawer' });
    await user.click(within(parent).getByRole('button', { name: 'Open nested' }));

    expect(await screen.findByRole('dialog', { name: 'Nested drawer' })).toBeInTheDocument();
    expect(parent).toBeInTheDocument();
    expect(parentCloseButton).toBeDisabled();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Nested drawer' })).not.toBeInTheDocument(),
    );
    expect(parent).toBeInTheDocument();
    expect(parentCloseButton).toBeEnabled();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(parent).not.toBeInTheDocument());
  });
});
