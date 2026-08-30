import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock extractFilesFromEvent to avoid setTimeout yields that jsdom's act()
// cannot flush during dragenter. The real traversal logic is covered by
// uploadUtils.test.ts; here we only verify the GalleryDropZone wiring.
vi.mock('../../../components/upload/uploadUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/upload/uploadUtils')>();
  return {
    ...actual,
    extractFilesFromEvent: vi.fn(actual.extractFilesFromEvent),
    classifyDropPayload: actual.classifyDropPayload,
  };
});

const { GalleryDropZone } = await import('../../../components/gallery/GalleryDropZone');
const { extractFilesFromEvent } = await import('../../../components/upload/uploadUtils');

const file = (name: string) => new File(['image'], name, { type: 'image/jpeg' });

const mockData = (files: File[]) => ({
  dataTransfer: {
    files,
    items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
    types: ['Files'],
  },
});

// Mock a directory entry with one nested file.
const makeDirEntry = (fullPath: string, entries: unknown[]): unknown => {
  const reader = {
    readEntries: (success: (e: unknown[]) => void) => success(entries),
  };
  return {
    isFile: false,
    isDirectory: true,
    fullPath,
    createReader: () => reader,
  };
};

const makeFileEntry = (fullPath: string, f: File): unknown => ({
  isFile: true,
  isDirectory: false,
  fullPath,
  name: f.name,
  file: (cb: (file: File) => void) => cb(f),
});

const mockDirData = (f: File) => {
  const fileEntry = makeFileEntry('folder/photo.jpg', f);
  const dirEntry = makeDirEntry('folder', [fileEntry]);
  return {
    dataTransfer: {
      files: [f],
      items: [
        {
          kind: 'file',
          type: f.type,
          getAsFile: () => f,
          webkitGetAsEntry: () => dirEntry,
          getAsEntry: () => dirEntry,
        },
      ],
      types: ['Files'],
    },
  };
};

describe('GalleryDropZone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(extractFilesFromEvent).mockRestore();
  });

  afterEach(() => {
    vi.mocked(extractFilesFromEvent).mockRestore();
  });

  it('shows a full-screen overlay and accepts a drop from the page surface', async () => {
    const onFilesAccepted = vi.fn();
    const f = file('drop.jpg');
    render(
      <GalleryDropZone onFilesAccepted={onFilesAccepted}>
        <main>Gallery</main>
      </GalleryDropZone>,
    );
    const pageRoot = screen.getByText('Gallery').parentElement!;

    await act(async () => {
      fireEvent.dragEnter(pageRoot, mockData([f]));
    });

    await waitFor(() => {
      expect(screen.getByTestId('upload-drag-overlay')).toBeInTheDocument();
      expect(screen.getByText('1 file detected')).toBeInTheDocument();
    });

    fireEvent.drop(screen.getByTestId('upload-drag-overlay'), mockData([f]));

    await waitFor(() => {
      expect(onFilesAccepted).toHaveBeenCalledWith([f]);
    });
  });

  it('passes top-level files from a directory drop', async () => {
    // Override extractFilesFromEvent to resolve synchronously (no setTimeout
    // yields) so jsdom act() can flush the dragenter processing.
    vi.mocked(extractFilesFromEvent).mockResolvedValue({
      files: [file('photo.jpg')],
      hadDirectory: true,
    });

    const onFilesAccepted = vi.fn();
    const f = file('photo.jpg');
    render(
      <GalleryDropZone onFilesAccepted={onFilesAccepted}>
        <main>Gallery</main>
      </GalleryDropZone>,
    );
    const pageRoot = screen.getByText('Gallery').parentElement!;

    await act(async () => {
      fireEvent.dragEnter(pageRoot, mockDirData(f));
    });

    const overlay = await screen.findByTestId('upload-drag-overlay');
    await act(async () => {
      fireEvent.drop(overlay, mockDirData(f));
    });

    await waitFor(() => {
      expect(onFilesAccepted).toHaveBeenCalledTimes(1);
      expect(onFilesAccepted.mock.calls[0][0]).toHaveLength(1);
      expect(onFilesAccepted.mock.calls[0][0][0].name).toBe('photo.jpg');
    });
  });

  it('preserves rejection feedback for unsupported files', async () => {
    const onFilesAccepted = vi.fn();
    const unsupported = new File(['text'], 'readme.txt', { type: 'text/plain' });
    render(
      <GalleryDropZone onFilesAccepted={onFilesAccepted}>
        <main>Gallery</main>
      </GalleryDropZone>,
    );
    const pageRoot = screen.getByText('Gallery').parentElement!;

    await act(async () => {
      fireEvent.dragEnter(pageRoot, mockData([unsupported]));
    });

    const overlay = await screen.findByTestId('upload-drag-overlay');
    await act(async () => {
      fireEvent.drop(overlay, mockData([unsupported]));
    });

    await waitFor(() => {
      expect(onFilesAccepted).not.toHaveBeenCalled();
    });
  });

  it('labels a dropped folder as a folder, not a file', async () => {
    const onFilesAccepted = vi.fn();
    const f = file('photo.jpg');
    render(
      <GalleryDropZone onFilesAccepted={onFilesAccepted}>
        <main>Gallery</main>
      </GalleryDropZone>,
    );
    const pageRoot = screen.getByText('Gallery').parentElement!;

    await act(async () => {
      fireEvent.dragEnter(pageRoot, mockDirData(f));
    });

    await waitFor(() => {
      expect(screen.getByTestId('upload-drag-overlay')).toBeInTheDocument();
      expect(screen.getByText('1 folder detected')).toBeInTheDocument();
      expect(screen.queryByText('1 file detected')).not.toBeInTheDocument();
    });
  });

  it('shows a scanning state while a directory drop is being read', async () => {
    let resolveExtraction!: (value: { files: File[]; hadDirectory: boolean }) => void;
    vi.mocked(extractFilesFromEvent).mockReturnValue(
      new Promise((resolve) => {
        resolveExtraction = resolve;
      }),
    );

    const onFilesAccepted = vi.fn();
    const f = file('photo.jpg');
    render(
      <GalleryDropZone onFilesAccepted={onFilesAccepted}>
        <main>Gallery</main>
      </GalleryDropZone>,
    );
    const pageRoot = screen.getByText('Gallery').parentElement!;

    await act(async () => {
      fireEvent.dragEnter(pageRoot, mockDirData(f));
    });
    const overlay = await screen.findByTestId('upload-drag-overlay');

    await act(async () => {
      fireEvent.drop(overlay, mockDirData(f));
    });

    // While the directory is being read, the overlay reports scanning.
    await waitFor(() => {
      expect(screen.getByText('Scanning folder')).toBeInTheDocument();
    });

    resolveExtraction({ files: [f], hadDirectory: true });
    await waitFor(() => {
      expect(onFilesAccepted).toHaveBeenCalledWith([f]);
    });
    await waitFor(() => {
      expect(screen.queryByText('Scanning folder')).not.toBeInTheDocument();
    });
  });
});
