import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PhotoRenameModal } from '../../components/PhotoRenameModal';

describe('PhotoRenameModal', () => {
  it('submits the rename action when Enter is pressed in the filename field', async () => {
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
    fireEvent.change(input, { target: { value: 'portrait-final' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith('portrait-final.jpg');
    });
  });
});
