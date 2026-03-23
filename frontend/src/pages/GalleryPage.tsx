import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { PhotoRenameModal } from '../components/PhotoRenameModal';
import { usePhotoLightbox } from '../hooks/usePhotoLightbox';
import { GalleryHeader } from '../components/gallery/GalleryHeader';
import { ShareLinksSection } from '../components/gallery/ShareLinksSection';
import { GalleryDragOverlay } from '../components/gallery/GalleryDragOverlay';
import { GalleryPhotoSection } from '../components/gallery/GalleryPhotoSection';
import {
  GalleryInitialLoadingState,
  GalleryLoadErrorState,
  GalleryNotFoundState,
} from '../components/gallery/GalleryPageStates';
import { type PhotoUploaderHandle } from '../components/PhotoUploader';
import { usePagination, useSelection, useGalleryActions, useGalleryDragAndDrop } from '../hooks';

export const GalleryPage = () => {
  const { id } = useParams<{ id: string }>();
  const galleryId = id!;
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showInitialLoadingState, setShowInitialLoadingState] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [photoSizeById, setPhotoSizeById] = useState<Record<string, number>>({});
  const gridRef = useRef<HTMLDivElement | null>(null);
  const photoUploaderRef = useRef<PhotoUploaderHandle | null>(null);

  // Use new hooks
  const pagination = usePagination({ pageSize: 100, syncWithUrl: true });
  const selection = useSelection<string>();

  const {
    gallery,
    photoUrls,
    shareLinks,
    isInitialLoading,
    isLoadingPhotos,
    isLoadingShareLinks,
    shareLinksError,
    uploadError,
    setUploadError,
    actionInfo,
    setActionInfo,
    isCreatingLink,
    isDownloadingZip,
    shootingDateInput,
    setShootingDateInput,
    isSavingShootingDate,
    error,
    clearError,
    ConfirmModal,
    renameModal,
    fetchGalleryDetails,
    fetchShareLinks,
    handleUploadComplete,
    handleSaveShootingDate,
    handleDeleteGallery,
    handleDownloadGallery,
    handleDownloadSelectedPhotos,
    handleSetCover,
    handleClearCover,
    handleCreateShareLink,
    handleDeleteShareLink,
    handleRenamePhoto,
    handleRenameConfirm,
    handleDeletePhoto,
    handleDeleteMultiplePhotos: handleDeletePhotos, // Renamed to avoid name clash
  } = useGalleryActions({ galleryId, pagination });

  // Drag and Drop
  const {
    isPageDragActive,
    handleGalleryDragEnter,
    handleGalleryDragOver,
    handleGalleryDragLeave,
    handleGalleryDrop,
  } = useGalleryDragAndDrop(photoUploaderRef);

  // Lightbox
  const { openLightbox, renderLightbox } = usePhotoLightbox({
    photoCardSelector: '[data-photo-card]',
    gridRef,
  });

  // Derived state
  const areAllOnPageSelected =
    photoUrls.length > 0 && photoUrls.every((p) => selection.isSelected(p.id));

  useEffect(() => {
    if (photoUrls.length === 0) {
      return;
    }

    setPhotoSizeById((prev) => {
      const next = { ...prev };
      for (const photo of photoUrls) {
        next[photo.id] = photo.file_size || 0;
      }
      return next;
    });
  }, [photoUrls]);

  const selectedSizeBytes = useMemo(() => {
    if (selection.selectedIds.size === 0) {
      return 0;
    }

    return Array.from(selection.selectedIds).reduce(
      (total, photoId) => total + (photoSizeById[photoId] || 0),
      0,
    );
  }, [photoSizeById, selection.selectedIds]);

  useEffect(() => {
    // Determine if this is the initial load (no gallery data yet)
    const isInitial = gallery === null;
    fetchGalleryDetails(pagination.page, isInitial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, galleryId]);

  useEffect(() => {
    if (!isInitialLoading) {
      setShowInitialLoadingState(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowInitialLoadingState(true);
    }, 220);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isInitialLoading]);

  // Handler for toggling photo selection
  const handleTogglePhotoSelection = (photoId: string, isShiftKey: boolean = false) => {
    if (isShiftKey) {
      const photoIds = photoUrls.map((p) => p.id);
      selection.selectRange(photoId, photoIds);
    } else {
      selection.toggle(photoId);
    }
  };

  // Handler for selecting all photos on current page
  const handleSelectAllPhotos = useCallback(() => {
    if (areAllOnPageSelected) {
      const pagePhotoIds = photoUrls.map((p) => p.id);
      pagePhotoIds.forEach((id) => selection.deselect(id));
    } else {
      selection.selectMultiple(photoUrls.map((p) => p.id));
    }
  }, [areAllOnPageSelected, photoUrls, selection]);

  useEffect(() => {
    if (!isSelectionMode) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isTypingTarget =
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        Boolean(target?.isContentEditable);

      if (isTypingTarget) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        selection.clear();
        setIsSelectionMode(false);
        return;
      }

      const isSelectAllShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'a';

      if (isSelectAllShortcut) {
        event.preventDefault();
        handleSelectAllPhotos();
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [isSelectionMode, handleSelectAllPhotos, selection]);

  // Handler for deleting multiple photos
  const handleDeleteMultiplePhotosWrapper = () => {
    handleDeletePhotos(selection.selectedIds, () => {
      selection.clear();
      setIsSelectionMode(false);
    });
  };

  const handleDownloadSelectedPhotosWrapper = () => {
    void handleDownloadSelectedPhotos(selection.selectedIds);
  };

  // Photo modal handlers
  const openPhoto = (index: number) => {
    if (!isSelectionMode) {
      openLightbox(index);
    } else {
      // In selection mode, clicking a photo toggles selection
      const photo = photoUrls[index];
      if (photo) {
        handleTogglePhotoSelection(photo.id);
      }
    }
  };

  if (isInitialLoading && showInitialLoadingState) {
    return <GalleryInitialLoadingState />;
  }

  if (isInitialLoading) {
    return null;
  }

  if (error && !gallery) {
    return (
      <GalleryLoadErrorState
        error={error}
        onRetry={() => fetchGalleryDetails(pagination.page, true)}
      />
    );
  }

  if (!gallery) {
    return <GalleryNotFoundState />;
  }

  return (
    <div
      className="relative min-h-screen pb-20"
      onDragEnter={isModalOpen ? undefined : handleGalleryDragEnter}
      onDragOver={isModalOpen ? undefined : handleGalleryDragOver}
      onDragLeave={isModalOpen ? undefined : handleGalleryDragLeave}
      onDrop={isModalOpen ? undefined : handleGalleryDrop}
      aria-label={isSelectionMode ? 'Selection mode active' : undefined}
    >
      <GalleryDragOverlay isActive={isPageDragActive} />

      <div className="space-y-8">
        {/* Gallery Header */}
        <GalleryHeader
          gallery={gallery}
          shootingDateInput={shootingDateInput}
          setShootingDateInput={setShootingDateInput}
          isSavingShootingDate={isSavingShootingDate}
          onSaveShootingDate={handleSaveShootingDate}
          onDeleteGallery={handleDeleteGallery}
        />

        <GalleryPhotoSection
          galleryId={galleryId}
          pagination={pagination}
          gridRef={gridRef}
          photoUploaderRef={photoUploaderRef}
          onModalStateChange={setIsModalOpen}
          state={{
            photoUrls,
            gallerySizeBytes: gallery.total_size_bytes ?? 0,
            isLoadingPhotos,
            uploadError,
            actionInfo,
            error,
            isSelectionMode,
            isDownloadingZip,
          }}
          selection={{
            areAllOnPageSelected,
            selectionCount: selection.count,
            selectedSizeBytes,
            hasSelection: selection.hasSelection,
            isPhotoSelected: (id) => selection.isSelected(id),
            isCoverPhoto: (photoId) => gallery.cover_photo_id === photoId,
          }}
          actions={{
            onUploadComplete: handleUploadComplete,
            onDismissUploadError: () => setUploadError(''),
            onDismissActionInfo: () => setActionInfo(''),
            onDismissError: clearError,
            onToggleSelectionMode: () => {
              if (isSelectionMode) {
                selection.clear();
                setIsSelectionMode(false);
              } else {
                setIsSelectionMode(true);
              }
            },
            onTogglePhotoSelection: handleTogglePhotoSelection,
            onOpenPhoto: openPhoto,
            onSetCover: handleSetCover,
            onClearCover: handleClearCover,
            onRenamePhoto: handleRenamePhoto,
            onDeletePhoto: handleDeletePhoto,
            onDownloadGallery: handleDownloadGallery,
            onDownloadSelectedPhotos: handleDownloadSelectedPhotosWrapper,
            onSelectAllPhotos: handleSelectAllPhotos,
            onCancelSelection: () => {
              selection.clear();
              setIsSelectionMode(false);
            },
            onDeleteMultiplePhotos: handleDeleteMultiplePhotosWrapper,
          }}
        />

        <ShareLinksSection
          shareLinks={shareLinks}
          isLoading={isLoadingShareLinks}
          error={shareLinksError}
          onRetry={fetchShareLinks}
          isCreatingLink={isCreatingLink}
          onCreateLink={handleCreateShareLink}
          onDeleteLink={handleDeleteShareLink}
        />
      </div>

      {/* Lightbox */}
      {renderLightbox(
        photoUrls.map((photo) => ({
          src: photo.url,
          thumbnailSrc: photo.thumbnail_url,
          alt: photo.filename,
          width: photo.width ?? undefined,
          height: photo.height ?? undefined,
          download: photo.url,
          downloadFilename: photo.filename,
        })),
        pagination.total,
      )}

      {/* Photo Rename Modal */}
      <AnimatePresence>
        {renameModal.isOpen && (
          <PhotoRenameModal
            isOpen={renameModal.isOpen}
            onClose={renameModal.close}
            currentFilename={renameModal.data?.filename || ''}
            onRename={handleRenameConfirm}
          />
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      {ConfirmModal}
    </div>
  );
};
