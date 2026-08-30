import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProjectGalleriesPanel } from '../../../components/project-page/components/ProjectGalleriesPanel';

const baseProps = {
  galleries: [],
  renameGalleryId: null,
  renameInput: '',
  isRenamingGallery: false,
  renameInputRef: { current: null },
  isUpdatingGallery: null,
  isReorderingGallery: null,
  requiresReorderConfirmation: false,
  openGalleryDialog: vi.fn(),
  setRenameInput: vi.fn(),
  handleConfirmRename: vi.fn(),
  cancelInlineRename: vi.fn(),
  beginInlineRename: vi.fn(),
  handleDeleteGallery: vi.fn(),
  setSharingGallery: vi.fn(),
  handleGalleryVisibilityChange: vi.fn(),
  requestGalleryVisibilityChange: vi.fn(),
  requestReorderGallery: vi.fn(),
} as const;

describe('ProjectGalleriesPanel empty state', () => {
  it('shows the Add first gallery button', () => {
    render(<ProjectGalleriesPanel {...baseProps} />);

    expect(screen.getByRole('button', { name: /add first gallery/i })).toBeInTheDocument();
  });

  it('hides the Upload folder action when onUploadFolder is not provided', () => {
    render(<ProjectGalleriesPanel {...baseProps} />);

    expect(screen.queryByRole('button', { name: /upload folder/i })).not.toBeInTheDocument();
  });

  it('calls onUploadFolder from the Upload folder button', async () => {
    const user = userEvent.setup();
    const onUploadFolder = vi.fn();

    render(<ProjectGalleriesPanel {...baseProps} onUploadFolder={onUploadFolder} />);

    await user.click(screen.getByRole('button', { name: /upload folder/i }));

    expect(onUploadFolder).toHaveBeenCalledTimes(1);
  });

  it('shows a busy state and disables the button while uploading', () => {
    const onUploadFolder = vi.fn();

    render(<ProjectGalleriesPanel {...baseProps} onUploadFolder={onUploadFolder} isUploadingFolder />);

    const button = screen.getByRole('button', { name: /creating gallery/i });
    expect(button).toBeDisabled();
  });
});
