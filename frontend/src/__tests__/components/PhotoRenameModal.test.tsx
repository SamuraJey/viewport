import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { PhotoRenameModal } from '../../components/PhotoRenameModal';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('PhotoRenameModal', () => {
  it('submits the rename action when Enter is pressed in the filename field', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <PhotoRenameModal
        isOpen
        onClose={onClose}
        currentFilename="portrait.jpg"
        onRename={onRename}
      />,
    );

    const input = await screen.findByLabelText(/filename/i);
    expect(screen.getByRole('button', { name: 'Submit rename photo form' })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'portrait-final' } });
    await user.click(input);
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith('portrait-final.jpg');
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Photo renamed', {
        description: 'Renamed to portrait-final.jpg',
      });
    });
  });
});
