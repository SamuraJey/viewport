import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppPopover } from '../../../components/ui/AppPopover';

describe('AppPopover', () => {
  beforeEach(() => {
    // Keep the trigger visible to Headless UI's disappearance observer in jsdom.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 20,
      y: 20,
      top: 20,
      left: 20,
      right: 120,
      bottom: 60,
      width: 100,
      height: 40,
      toJSON: () => ({}),
    });
  });

  it('waits for the anchored panel to enter before focusing, including after reopening', async () => {
    render(
      <AppPopover
        buttonAriaLabel="Project actions"
        buttonContent="Actions"
        panelFocus
        panel={
          <>
            <button disabled>Copy link</button>
            <button>Open project</button>
          </>
        }
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Project actions' });

    for (let opening = 0; opening < 2; opening += 1) {
      fireEvent.click(trigger);
      const action = screen.getByRole('button', { name: 'Open project' });

      // The portal has mounted, but Floating UI has not positioned it yet.
      expect(trigger).toHaveFocus();
      expect(action).not.toHaveFocus();

      await waitFor(() => expect(action).toHaveFocus());
      fireEvent.keyDown(action, { key: 'Escape' });
      expect(trigger).toHaveFocus();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Open project' })).not.toBeInTheDocument(),
      );
    }
  });

  it('keeps focus on the trigger when panel focus is not requested', async () => {
    render(<AppPopover buttonContent="Actions" panel={<button>Open project</button>} />);

    const trigger = screen.getByRole('button', { name: 'Actions' });
    fireEvent.click(trigger);
    await screen.findByRole('button', { name: 'Open project' });
    expect(trigger).toHaveFocus();
  });
});
