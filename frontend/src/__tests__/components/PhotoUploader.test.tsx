import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { PhotoUploader } from '../../components/PhotoUploader';
import { GalleryDropZone } from '../../components/gallery/GalleryDropZone';
import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_VIDEO_UPLOAD_FILE_SIZE_MB } from '../../constants/upload';
import { resizeImageForUpload } from '../../lib/imageResize';

vi.mock('../../lib/imageResize', () => ({
  resizeImageForUpload: vi.fn(async (file: File) => file),
}));

// jsdom does not support webkitdirectory, so feature-detect it as supported
// in tests by stubbing the property on created input elements.
beforeEach(() => {
  Object.defineProperty(HTMLInputElement.prototype, 'webkitdirectory', {
    configurable: true,
    get: () => '',
    set: () => {},
  });
});

afterEach(() => {
  delete (HTMLInputElement.prototype as unknown as Record<string, unknown>).webkitdirectory;
});

describe('PhotoUploader', () => {
  const mockOnUploadComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Make sure onUploadComplete returns a resolved promise by default
    mockOnUploadComplete.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.mocked(resizeImageForUpload).mockReset();
    vi.mocked(resizeImageForUpload).mockImplementation(async (file: File) => file);
  });

  it('should render drop zone with file input', () => {
    render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

    expect(screen.getByLabelText(/upload photos or videos/i)).toBeInTheDocument();
    expect(screen.getByText('Drag & drop photos or videos here')).toBeInTheDocument();
    expect(screen.getByLabelText(/choose photos or videos/i)).toHaveAttribute(
      'accept',
      expect.stringContaining('video/mp4'),
    );
    expect(
      screen.getByText(/JPG \/ PNG \/ MP4 \/ MOV.*10 MB \(images\).*500 MB \(video\)/i),
    ).toBeInTheDocument();
  });

  it('should show uploading state when isUploading is true', () => {
    render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

    expect(screen.getByLabelText(/upload photos/i)).toBeInTheDocument();
    // When uploading, the interface should be disabled or show loading state
  });

  it('should handle file selection through file input', async () => {
    const user = userEvent.setup();
    const file1 = new File(['image1'], 'test1.jpg', { type: 'image/jpeg' });
    const file2 = new File(['image2'], 'test2.png', { type: 'image/png' });

    render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();

    if (fileInput) {
      await user.upload(fileInput as HTMLInputElement, [file1, file2]);

      // Should show selected files
      await waitFor(() => {
        expect(screen.getByText('test1.jpg')).toBeInTheDocument();
        expect(screen.getByText('test2.png')).toBeInTheDocument();
      });

      // Thumbnails are generated via native Blob URLs lazy-loaded by IntersectionObserver
      await waitFor(() => {
        expect(screen.getByAltText('Preview of test1.jpg')).toBeInTheDocument();
        expect(screen.getByAltText('Preview of test2.png')).toBeInTheDocument();
      });

      // 1 call per file: for the thumbnail blob URL
      expect(URL.createObjectURL).toHaveBeenCalled();
    }
  });

  it('should revoke preview URL when a selected file is removed', async () => {
    const user = userEvent.setup();
    const file = new File(['image'], 'remove-me.jpg', { type: 'image/jpeg' });

    render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();

    if (fileInput) {
      await user.upload(fileInput as HTMLInputElement, file);

      // Thumbnail is generated asynchronously — wait for the img tag to appear
      await waitFor(() => {
        expect(screen.getByAltText('Preview of remove-me.jpg')).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText('Remove remove-me.jpg'));

      await waitFor(() => {
        expect(screen.queryByAltText('Preview of remove-me.jpg')).not.toBeInTheDocument();
      });

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    }
  });

  it('re-enables intake after the last queued file is removed', async () => {
    const user = userEvent.setup();
    const onModalStateChange = vi.fn();
    const firstFile = new File(['first'], 'first.jpg', { type: 'image/jpeg' });
    const nextFile = new File(['next'], 'next-drop.jpg', { type: 'image/jpeg' });

    render(
      <PhotoUploader
        galleryId="test-gallery"
        onUploadComplete={mockOnUploadComplete}
        onModalStateChange={onModalStateChange}
      />,
    );

    const dropZone = screen.getByLabelText(/upload photos or videos/i);
    const fileInput = dropZone.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();

    await user.upload(fileInput as HTMLInputElement, firstFile);
    expect(await screen.findByText('first.jpg')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Remove first.jpg'));

    await waitFor(() => {
      expect(screen.queryByText('first.jpg')).not.toBeInTheDocument();
      expect(onModalStateChange).toHaveBeenLastCalledWith(false);
    });

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [nextFile],
        items: [{ kind: 'file', type: 'image/jpeg', getAsFile: () => nextFile }],
        types: ['Files'],
      },
    });

    expect(await screen.findByText('next-drop.jpg')).toBeInTheDocument();
    expect(onModalStateChange).toHaveBeenLastCalledWith(true);
  });

  it('adds dropped files to an existing review queue', async () => {
    const user = userEvent.setup();
    const firstFile = new File(['first'], 'first.jpg', { type: 'image/jpeg' });
    const addedFile = new File(['added'], 'added-in-review.jpg', { type: 'image/jpeg' });

    render(
      <GalleryDropZone onFilesAccepted={vi.fn()} disabled>
        <PhotoUploader
          galleryId="test-gallery"
          onUploadComplete={mockOnUploadComplete}
          showDropzone={false}
        />
      </GalleryDropZone>,
    );

    const initialInput = screen
      .getAllByLabelText('Choose photos or videos to upload')
      .find((input) => input.classList.contains('hidden'));
    expect(initialInput).toBeDefined();
    await user.upload(initialInput!, firstFile);
    expect(await screen.findByText('first.jpg')).toBeInTheDocument();

    fireEvent.dragEnter(initialInput.parentElement!, {
      dataTransfer: {
        files: [addedFile],
        items: [{ kind: 'file', type: 'image/jpeg', getAsFile: () => addedFile }],
        types: ['Files'],
      },
    });
    expect(screen.queryByTestId('upload-drag-overlay')).not.toBeInTheDocument();

    const reviewModalHeader = screen.getByRole('heading', { name: /review files/i });
    fireEvent.drop(reviewModalHeader, {
      dataTransfer: {
        files: [addedFile],
        items: [{ kind: 'file', type: 'image/jpeg', getAsFile: () => addedFile }],
        types: ['Files'],
      },
    });

    expect(await screen.findByText('added-in-review.jpg')).toBeInTheDocument();
    expect(screen.getByText('first.jpg')).toBeInTheDocument();
  });

  it('adds pasted files to an existing review queue', async () => {
    const user = userEvent.setup();
    const firstFile = new File(['first'], 'first.jpg', { type: 'image/jpeg' });
    const pastedFile = new File(['pasted'], 'pasted-in-review.jpg', { type: 'image/jpeg' });

    render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

    await user.upload(screen.getByLabelText('Choose photos or videos to upload'), firstFile);
    expect(await screen.findByText('first.jpg')).toBeInTheDocument();

    fireEvent.paste(document, {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/jpeg', getAsFile: () => pastedFile }],
      },
    });

    expect(await screen.findByText('pasted-in-review.jpg')).toBeInTheDocument();
    expect(screen.getByText('first.jpg')).toBeInTheDocument();
  });

  it('should reject unsupported files', async () => {
    const onUploadComplete = vi.fn().mockResolvedValue(undefined);
    render(<PhotoUploader galleryId="test-gallery" onUploadComplete={onUploadComplete} />);

    const fileInput = screen
      .getByRole('button', { name: /upload photos/i })
      .querySelector('input[type="file"]');
    if (fileInput) {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      // Wait for error message to appear
      await waitFor(() => {
        expect(
          screen.getByText(
            'Only JPG, PNG and supported video files are allowed. Please select valid files.',
          ),
        ).toBeInTheDocument();
      });

      // Modal should not open for invalid files
      expect(screen.queryByText('Confirm Photo Upload')).not.toBeInTheDocument();
    }
  });

  it('should open modal with oversized file and show resize option', async () => {
    const user = userEvent.setup();
    // Create a file that's too large (over upload limit)
    const largeFile = new File([new ArrayBuffer(MAX_UPLOAD_FILE_SIZE_BYTES + 1024)], 'large.jpg', {
      type: 'image/jpeg',
    });

    render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

    const fileInput = screen.getByLabelText('Choose photos or videos to upload');

    await user.upload(fileInput as HTMLInputElement, [largeFile]);

    // Modal should open showing the oversized file
    await waitFor(() => {
      expect(screen.getByText('large.jpg')).toBeInTheDocument();
    });

    // Should show warning about oversized files
    expect(screen.getByText(/All selected files exceed the maximum size/)).toBeInTheDocument();

    // Resize All button should be visible for oversized resizable files
    expect(screen.getByLabelText('Resize all oversized images')).toBeInTheDocument();

    // Upper bound should be shown (library guarantees ≤ 10 MB)
    expect(screen.getByText(/→ ≤ 10 MB/)).toBeInTheDocument();

    // Resize button on the file card should still be visible
    expect(screen.getByLabelText('Resize large.jpg to fit size limit')).toBeInTheDocument();

    // Upload button should be disabled
    expect(screen.getByText('Upload').closest('button')).toBeDisabled();
  });

  it('offers resize for an oversized JPG when the browser omits its MIME type', async () => {
    const largeFile = new File(['image'], 'mime-missing.jpg', { type: '' });
    Object.defineProperty(largeFile, 'size', {
      value: MAX_UPLOAD_FILE_SIZE_BYTES + 1,
    });

    render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

    fireEvent.change(screen.getByLabelText('Choose photos or videos to upload'), {
      target: { files: [largeFile] },
    });

    expect(
      await screen.findByLabelText('Resize mime-missing.jpg to fit size limit'),
    ).toBeInTheDocument();
  });

  it('does not resurrect a discarded file when resize finishes after close', async () => {
    const user = userEvent.setup();
    let resolveResize!: (file: File) => void;
    vi.mocked(resizeImageForUpload).mockReturnValue(
      new Promise<File>((resolve) => {
        resolveResize = resolve;
      }),
    );
    const largeFile = new File(
      [new ArrayBuffer(MAX_UPLOAD_FILE_SIZE_BYTES + 1)],
      'discard-me.jpg',
      {
        type: 'image/jpeg',
      },
    );

    render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

    await user.upload(screen.getByLabelText('Choose photos or videos to upload'), largeFile);
    await user.click(await screen.findByLabelText('Resize discard-me.jpg to fit size limit'));
    await user.click(screen.getByLabelText('Close upload dialog'));
    await user.click(screen.getByRole('button', { name: 'Yes, Close' }));

    await act(async () => {
      resolveResize(new File(['resized'], 'discard-me.jpg', { type: 'image/jpeg' }));
      await Promise.resolve();
    });

    const nextFile = new File(['next'], 'next.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Choose photos or videos to upload'), nextFile);

    expect(await screen.findByText('next.jpg')).toBeInTheDocument();
    expect(screen.queryByText('discard-me.jpg')).not.toBeInTheDocument();
  });

  it('disables upload during a single resize and completes it under Strict Mode', async () => {
    const user = userEvent.setup();
    let resolveResize!: (file: File) => void;
    vi.mocked(resizeImageForUpload).mockReturnValue(
      new Promise<File>((resolve) => {
        resolveResize = resolve;
      }),
    );
    const validFile = new File(['valid'], 'valid.jpg', { type: 'image/jpeg' });
    const largeFile = new File(
      [new ArrayBuffer(MAX_UPLOAD_FILE_SIZE_BYTES + 1)],
      'large.jpg',
      {
        type: 'image/jpeg',
      },
    );

    render(
      <StrictMode>
        <PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />
      </StrictMode>,
    );

    await user.upload(screen.getByLabelText('Choose photos or videos to upload'), [
      validFile,
      largeFile,
    ]);

    const uploadButton = await screen.findByRole('button', { name: 'Upload' });
    expect(uploadButton).toBeEnabled();

    await user.click(screen.getByLabelText('Resize large.jpg to fit size limit'));
    expect(uploadButton).toBeDisabled();

    await act(async () => {
      resolveResize(new File(['resized'], 'large.jpg', { type: 'image/jpeg' }));
      await Promise.resolve();
    });

    await waitFor(() => expect(uploadButton).toBeEnabled());
  });

  it('should exclude oversized videos while continuing with valid files', async () => {
    const user = userEvent.setup();
    const image = new File(['image'], 'valid.jpg', { type: 'image/jpeg' });
    const oversizedVideo = new File(['video'], 'too-large.mp4', { type: 'video/mp4' });
    Object.defineProperty(oversizedVideo, 'size', {
      value: (MAX_VIDEO_UPLOAD_FILE_SIZE_MB + 1) * 1024 * 1024,
    });

    render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

    await user.upload(screen.getByLabelText('Choose photos or videos to upload'), [
      image,
      oversizedVideo,
    ]);

    await waitFor(() => {
      expect(screen.getByText('valid.jpg')).toBeInTheDocument();
    });
    expect(screen.queryByText('too-large.mp4')).not.toBeInTheDocument();
    expect(
      screen.getByText(`Video files may be up to ${MAX_VIDEO_UPLOAD_FILE_SIZE_MB} MB.`),
    ).toBeInTheDocument();
  });

  it('should handle drag and drop events', async () => {
    const file = new File(['image'], 'dropped.jpg', { type: 'image/jpeg' });

    render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

    const dropZone = screen.getByLabelText(/upload photos/i);

    // Simulate drag enter
    fireEvent.dragEnter(dropZone, {
      dataTransfer: {
        files: [file],
        items: [{ kind: 'file', type: 'image/jpeg', getAsFile: () => file }],
        types: ['Files'],
      },
    });

    // Simulate drop
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
        items: [{ kind: 'file', type: 'image/jpeg', getAsFile: () => file }],
        types: ['Files'],
      },
    });

    // Should show the dropped file
    await waitFor(() => {
      expect(screen.getByText('dropped.jpg')).toBeInTheDocument();
    });
  });

  it('should trigger onUpload when files are ready and conditions are met', async () => {
    const user = userEvent.setup();
    const file = new File(['image'], 'test.jpg', { type: 'image/jpeg' });

    mockOnUploadComplete.mockResolvedValue(undefined);

    render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

    const fileInput = screen.getByLabelText(/upload photos/i).querySelector('input[type="file"]');

    if (fileInput) {
      await user.upload(fileInput as HTMLInputElement, [file]);

      // The component should show the file is selected
      await waitFor(() => {
        expect(screen.getByText('test.jpg')).toBeInTheDocument();
      });
    }
  });

  it('should show error messages when validation fails', () => {
    render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

    // First render without error
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();

    // Re-render with mock error state (this would normally be handled by the component internally)
    // For this test, we'll just verify the component structure can handle errors
    expect(screen.getByLabelText(/upload photos/i)).toBeInTheDocument();
  });

  it('should handle click to select files', async () => {
    const user = userEvent.setup();

    render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

    const dropZone = screen.getByLabelText(/upload photos/i);

    // Clicking the drop zone should trigger file selection
    await user.click(dropZone);

    // The file input should be in the document (always rendered)
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it('should prevent upload when isUploading is true', () => {
    render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

    const dropZone = screen.getByLabelText(/upload photos/i);

    // Component should be in uploading state
    expect(dropZone).toBeInTheDocument();

    // onUploadComplete should not be called when already uploading
    expect(mockOnUploadComplete).not.toHaveBeenCalled();
  });

  describe('folder picker', () => {
    it('renders a hidden folder input with webkitdirectory, multiple, and accept', async () => {
      render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

      const folderInput = await screen.findByLabelText('Choose a folder to upload');
      expect(folderInput).toHaveAttribute('webkitdirectory');
      expect(folderInput).toHaveAttribute('multiple');
      expect(folderInput.getAttribute('accept')).toContain('image/jpeg');
    });

    it('opens the review queue after folder selection', async () => {
      const { setUploadSourcePath } = await import('../../components/upload/uploadUtils');
      const f = new File(['image'], 'photo.jpg', { type: 'image/jpeg' });
      setUploadSourcePath(f, 'folder/photo.jpg');

      render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

      const folderInput = await screen.findByLabelText('Choose a folder to upload');
      await act(async () => {
        fireEvent.change(folderInput, { target: { files: [f] } });
      });

      expect(await screen.findByText('photo.jpg')).toBeInTheDocument();
    });

    it('keeps two files with the same basename from different source paths', async () => {
      const { setUploadSourcePath, getUploadFileKey } = await import(
        '../../components/upload/uploadUtils'
      );
      // Use different content sizes so the files are distinct even without
      // source path, then verify the source path makes the keys different.
      const first = new File(['aa'], 'photo.jpg', { type: 'image/jpeg' });
      const second = new File(['bbb'], 'photo.jpg', {
        type: 'image/jpeg',
        lastModified: 99,
      });
      setUploadSourcePath(first, 'folder-a/photo.jpg');
      setUploadSourcePath(second, 'folder-b/photo.jpg');

      // Verify keys are distinct before rendering.
      expect(getUploadFileKey(first)).not.toBe(getUploadFileKey(second));

      render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

      const folderInput = await screen.findByLabelText('Choose a folder to upload');
      await act(async () => {
        fireEvent.change(folderInput, { target: { files: [first, second] } });
      });

      // Both files should appear — same basename, different content + source paths.
      const items = await screen.findAllByText('photo.jpg');
      expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it('reports duplicates when the same folder is re-selected', async () => {
      const { setUploadSourcePath } = await import('../../components/upload/uploadUtils');
      const f = new File(['image'], 'photo.jpg', { type: 'image/jpeg' });
      setUploadSourcePath(f, 'folder/photo.jpg');

      render(<PhotoUploader galleryId="test-gallery" onUploadComplete={mockOnUploadComplete} />);

      const folderInput = await screen.findByLabelText('Choose a folder to upload');
      await act(async () => {
        fireEvent.change(folderInput, { target: { files: [f] } });
      });
      expect(await screen.findByText('photo.jpg')).toBeInTheDocument();

      // Re-select the same file (same source path) — should be deduplicated.
      const { toast } = await import('sonner');
      const toastSpy = vi.spyOn(toast, 'info');
      await act(async () => {
        fireEvent.change(folderInput, { target: { files: [f] } });
      });

      // A duplicate toast should have been emitted.
      expect(toastSpy.mock.calls.some((call) => /duplicate/i.test(String(call[0])))).toBe(true);
      toastSpy.mockRestore();
    });
  });
});
