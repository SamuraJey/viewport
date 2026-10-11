import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { GalleryPhotoSection } from '../../../components/gallery/GalleryPhotoSection';

const makeProps = (): ComponentProps<typeof GalleryPhotoSection> => ({
  pagination: {
    page: 1,
    pageSize: 100,
    total: 1,
    totalPages: 1,
    isFirstPage: true,
    isLastPage: true,
    nextPage: vi.fn(),
    previousPage: vi.fn(),
    goToPage: vi.fn(),
  },
  gridRef: { current: null },
  photoUploaderRef: { current: null },
  state: {
    photoUrls: [
      {
        id: 'photo',
        filename: 'photo.jpg',
        thumbnail_url: 'https://example.test/thumb.jpg',
        url: 'https://example.test/original.jpg',
        media_type: 'image',
        status: 'successful',
        file_size: 100,
        uploaded_at: '2026-01-01',
      },
    ],
    isLoadingPhotos: false,
    uploadError: null,
    actionInfo: null,
    error: null,
    isSelectionMode: false,
  },
  selection: {
    areAllOnPageSelected: false,
    selectionCount: 0,
    selectedSizeBytes: 0,
    hasSelection: false,
    isPhotoSelected: () => false,
    isCoverPhoto: () => false,
  },
  actions: {
    onDismissUploadError: vi.fn(),
    onDismissActionInfo: vi.fn(),
    onDismissError: vi.fn(),
    onTogglePhotoSelection: vi.fn(),
    onOpenPhoto: vi.fn(),
    onSetCover: vi.fn(),
    onClearCover: vi.fn(),
    onRenamePhoto: vi.fn(),
    onDownloadPhoto: vi.fn(),
    onDeletePhoto: vi.fn(),
    onDownloadSelectedPhotos: vi.fn(),
    onClearSearch: vi.fn(),
    onSelectAllPhotos: vi.fn(),
    onCancelSelection: vi.fn(),
    onDeleteMultiplePhotos: vi.fn(),
  },
});

describe('GalleryPhotoSection', () => {
  it('retains loaded cards during revalidation and uses the latest actions', async () => {
    const props = makeProps();
    const { container, rerender } = render(<GalleryPhotoSection {...props} />);
    const card = container.querySelector('[data-photo-card]');
    const onDownloadPhoto = vi.fn();
    rerender(
      <GalleryPhotoSection
        {...props}
        state={{ ...props.state, isLoadingPhotos: true }}
        actions={{ ...props.actions, onDownloadPhoto }}
      />,
    );
    expect(container.querySelector('[data-photo-card]')).toBe(card);
    expect(screen.queryByTestId('private-gallery-skeleton-grid')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Download photo' }));
    expect(onDownloadPhoto).toHaveBeenCalledExactlyOnceWith('photo');
    expect(props.actions.onDownloadPhoto).not.toHaveBeenCalled();
  });

  it('shows a labeled skeleton when no photos have loaded', () => {
    const props = makeProps();
    render(
      <GalleryPhotoSection
        {...props}
        state={{ ...props.state, photoUrls: [], isLoadingPhotos: true }}
      />,
    );
    expect(screen.getByRole('status', { name: 'Loading photos page 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download photo' })).not.toBeInTheDocument();
  });
});
