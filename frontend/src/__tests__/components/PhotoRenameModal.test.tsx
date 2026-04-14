import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PhotoRenameModal } from '../../components/PhotoRenameModal';

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
    await user.clear(input);
    await user.type(input, 'portrait-final{enter}');

    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith('portrait-final.jpg');
    });
  });
});
