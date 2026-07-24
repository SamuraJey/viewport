import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GalleryDropZone } from '../../../components/gallery/GalleryDropZone';

const transferFor = (file: File) => ({
  files: [file],
  items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
  types: ['Files'],
});

describe('GalleryDropZone', () => {
  it('shows a full-screen overlay and accepts a drop from the page surface', async () => {
    const onFilesAccepted = vi.fn();
    const file = new File(['image'], 'drop.jpg', { type: 'image/jpeg' });
    render(
      <GalleryDropZone onFilesAccepted={onFilesAccepted}>
        <main>Gallery</main>
      </GalleryDropZone>,
    );
    const pageRoot = screen.getByText('Gallery').parentElement!;

    fireEvent.dragEnter(pageRoot, { dataTransfer: transferFor(file) });

    await waitFor(() => {
      expect(screen.getByTestId('upload-drag-overlay')).toBeInTheDocument();
      expect(screen.getByText('1 file detected')).toBeInTheDocument();
    });

    fireEvent.drop(screen.getByTestId('upload-drag-overlay'), {
      dataTransfer: transferFor(file),
    });

    await waitFor(() => {
      expect(onFilesAccepted).toHaveBeenCalledWith([file]);
    });
  });
});
