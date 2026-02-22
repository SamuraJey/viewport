import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Layout } from '../components/Layout';
import { PhotoRenameModal } from '../components/PhotoRenameModal';
import { usePhotoLightbox } from '../hooks/usePhotoLightbox';
import { GalleryHeader } from '../components/gallery/GalleryHeader';
import { ShareLinksSection } from '../components/gallery/ShareLinksSection';
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

  // Use new hooks
  const pagination = usePagination({ pageSize: 100, syncWithUrl: true });
  const selection = useSelection<string>();

  const {
    gallery,
    photoUrls,
    shareLinks,
    isInitialLoading,
    isLoadingPhotos,
    uploadError,
    setUploadError,
    isCreatingLink,
    shootingDateInput,
    setShootingDateInput,
    isSavingShootingDate,
    error,
    clearError,
    ConfirmModal,
    renameModal,
    fetchGalleryDetails,
    handleUploadComplete,
    handleSaveShootingDate,
    handleDeleteGallery,
    handleSetCover,
    handleClearCover,
    handleCreateShareLink,
    handleDeleteShareLink,
    handleRenamePhoto,
    handleRenameConfirm,
    handleDeletePhoto,
    handleDeleteMultiplePhotos,
  } = useGalleryActions({ galleryId, pagination });

  // State
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Refs
  const gridRef = useRef<HTMLDivElement | null>(null);
  const photoUploaderRef = useRef<PhotoUploaderHandle | null>(null);

  const {
    isPageDragActive,
    handleGalleryDragEnter,
    handleGalleryDragOver,
    handleGalleryDragLeave,
    handleGalleryDrop,
  } = useGalleryDragAndDrop(photoUploaderRef);

  const { openLightbox, renderLightbox } = usePhotoLightbox({
    photoCardSelector: '[data-photo-card]',
    gridRef,
  });

  // Derived state
  const areAllOnPageSelected =
    photoUrls.length > 0 && photoUrls.every((p) => selection.isSelected(p.id));

  useEffect(() => {
    const isInitial = gallery === null;
    fetchGalleryDetails(pagination.page, isInitial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, galleryId]);

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
  const handleSelectAllPhotos = () => {
    if (areAllOnPageSelected) {
      // Deselect all on this page
      const pagePhotoIds = photoUrls.map((p) => p.id);
      pagePhotoIds.forEach((id) => selection.deselect(id));
    } else {
      // Select all on this page
      selection.selectMultiple(photoUrls.map((p) => p.id));
    }
  };

  // Handler for deleting multiple photos
  const handleDeleteMultiplePhotosWrapper = () => {
    handleDeleteMultiplePhotos(selection.selectedIds, () => {
      selection.clear();
      setIsSelectionMode(false);
    });
  };

  // Photo modal handlers
  const openPhoto = (index: number) => {
    openLightbox(index);
  };

  if (isInitialLoading) {
    return <GalleryInitialLoadingState />;
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
    <Layout>
      <div
        className="relative space-y-6"
        onDragEnter={handleGalleryDragEnter}
        onDragOver={handleGalleryDragOver}
        onDragLeave={handleGalleryDragLeave}
        onDrop={handleGalleryDrop}
      >
        {isPageDragActive && (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-[1px]">
            <div className="rounded-xl border border-accent/30 bg-surface/95 px-6 py-4 text-center shadow-xl dark:bg-surface-dark/95">
              <p className="text-base font-semibold text-text">Drop photos to upload</p>
              <p className="mt-1 text-sm text-muted">JPG / PNG · up to 15 MB</p>
            </div>
          </div>
        )}

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
          photoUrls={photoUrls}
          pagination={pagination}
          isLoadingPhotos={isLoadingPhotos}
          uploadError={uploadError}
          error={error}
          isSelectionMode={isSelectionMode}
          isCoverPhoto={(photoId) => gallery.cover_photo_id === photoId}
          isPhotoSelected={selection.isSelected}
          areAllOnPageSelected={areAllOnPageSelected}
          selectionCount={selection.count}
          hasSelection={selection.hasSelection}
          gridRef={gridRef}
          photoUploaderRef={photoUploaderRef}
          onUploadComplete={handleUploadComplete}
          onDismissUploadError={() => setUploadError('')}
          onDismissError={clearError}
          onToggleSelectionMode={() => {
            if (isSelectionMode) {
              selection.clear();
              setIsSelectionMode(false);
            } else {
              setIsSelectionMode(true);
            }
          }}
          onTogglePhotoSelection={handleTogglePhotoSelection}
          onOpenPhoto={openPhoto}
          onSetCover={handleSetCover}
          onClearCover={handleClearCover}
          onRenamePhoto={handleRenamePhoto}
          onDeletePhoto={handleDeletePhoto}
          onSelectAllPhotos={handleSelectAllPhotos}
          onCancelSelection={() => {
            selection.clear();
            setIsSelectionMode(false);
          }}
          onDeleteMultiplePhotos={handleDeleteMultiplePhotosWrapper}
        />
        <ShareLinksSection
          shareLinks={shareLinks}
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
    </Layout>
  );
};
