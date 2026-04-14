import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('AppDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('ignores escape immediately after opening and closes after the guard window', async () => {
    render(<DialogHarness />);

    fireEvent.click(screen.getByRole('button', { name: /open dialog/i }));

    expect(screen.getByRole('dialog', { name: /test dialog/i })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getByRole('dialog', { name: /test dialog/i })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: /test dialog/i })).not.toBeInTheDocument();
  });

  it('keeps the dialog open when canClose is disabled', async () => {
    render(<DialogHarness canClose={false} />);

    fireEvent.click(screen.getByRole('button', { name: /open dialog/i }));

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getByRole('dialog', { name: /test dialog/i })).toBeInTheDocument();
  });
});
