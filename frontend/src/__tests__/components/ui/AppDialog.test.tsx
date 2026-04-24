import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { AppDialog, AppDialogDescription, AppDialogTitle } from '../../../components/ui';

interface DialogHarnessProps {
  canClose?: boolean;
}

const DialogHarness = ({ canClose = true }: DialogHarnessProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>

      <AppDialog open={open} onClose={() => setOpen(false)} canClose={canClose}>
        <div className="rounded-xl bg-surface p-4">
          <AppDialogTitle>Test dialog</AppDialogTitle>
          <AppDialogDescription>Dialog description</AppDialogDescription>
          <button type="button">Dialog action</button>
        </div>
      </AppDialog>
    </>
  );
};

const waitForCloseGuardFrame = async () => {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
};

describe('AppDialog', () => {
  it('closes when clicking outside the dialog panel', async () => {
    const user = userEvent.setup();

    render(<DialogHarness />);

    await user.click(screen.getByRole('button', { name: /open dialog/i }));

    const dialog = await screen.findByRole('dialog', { name: /test dialog/i });
    const panel = dialog.querySelector('[id^="headlessui-dialog-panel"]');
    expect(panel).toHaveClass('max-w-lg');

    const backdrop = dialog.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as HTMLElement);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /test dialog/i })).not.toBeInTheDocument();
    });
  });

  it('closes on Escape when canClose is enabled', async () => {
    const user = userEvent.setup();

    render(<DialogHarness />);

    await user.click(screen.getByRole('button', { name: /open dialog/i }));
    expect(await screen.findByRole('dialog', { name: /test dialog/i })).toBeInTheDocument();
    await waitForCloseGuardFrame();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /test dialog/i })).not.toBeInTheDocument();
    });
  });

  it('keeps the dialog open when canClose is disabled', async () => {
    const user = userEvent.setup();

    render(<DialogHarness canClose={false} />);

    await user.click(screen.getByRole('button', { name: /open dialog/i }));
    expect(await screen.findByRole('dialog', { name: /test dialog/i })).toBeInTheDocument();
    await waitForCloseGuardFrame();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByRole('dialog', { name: /test dialog/i })).toBeInTheDocument();
  });
});
