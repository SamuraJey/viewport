import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Layout } from '../components/Layout';
import { PhotoRenameModal } from '../components/PhotoRenameModal';
import { usePhotoLightbox } from '../hooks/usePhotoLightbox';
import { Loader2, CheckSquare, Upload } from 'lucide-react';
import { PaginationControls } from '../components/PaginationControls';
import { GalleryHeader } from '../components/gallery/GalleryHeader';
import { ShareLinksSection } from '../components/gallery/ShareLinksSection';
import { PhotoCard } from '../components/gallery/PhotoCard';
import { PhotoSelectionBar } from '../components/gallery/PhotoSelectionBar';
import { EmptyGalleryState } from '../components/gallery/EmptyGalleryState';
import { PhotoUploader, type PhotoUploaderHandle } from '../components/PhotoUploader';
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
    // Initial loading state - show full page loader
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-16 h-16 animate-spin text-accent" />
            <p className="text-lg text-muted">Loading gallery...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error && !gallery) {
    // Error state when gallery failed to load initially
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="text-danger text-lg font-medium">Failed to load gallery</div>
            <div className="text-muted dark:text-muted-dark">{error}</div>
            <button
              onClick={() => fetchGalleryDetails(pagination.page, true)}
              className="px-4 py-2 bg-accent text-accent-foreground rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-accent/20"
            >
              Try Again
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  if (!gallery) {
    // ... (keep existing not found state)
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <div className="text-muted dark:text-muted-dark text-lg">Gallery not found</div>
            <Link to="/" className="text-accent hover:underline">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </Layout>
    );
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

        {/* Photo Section */}
        <div
          className="bg-surface dark:bg-surface-foreground/5 rounded-2xl p-4 lg:p-6 xl:p-8 border border-border dark:border-border/10"
          data-photos-section
        >
          <div className="mb-8">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-2xl font-semibold text-text">
                Photos
                {pagination.total > 0 && (
                  <span className="ml-2 text-lg text-muted font-normal">
                    ({photoUrls.length} of {pagination.total})
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => photoUploaderRef.current?.openFilePicker()}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 text-sm font-medium text-accent transition-all duration-200 hover:bg-accent/20"
                  title="Add photos (JPG/PNG up to 15 MB)"
                >
                  <Upload className="h-4 w-4" />
                  Add Photos
                </button>
                {photoUrls.length > 0 && (
                  <button
                    onClick={() => {
                      if (isSelectionMode) {
                        selection.clear();
                        setIsSelectionMode(false);
                      } else {
                        setIsSelectionMode(true);
                      }
                    }}
                    className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-all duration-200 ${
                      isSelectionMode
                        ? 'border-accent bg-accent text-accent-foreground shadow-sm hover:brightness-105 hover:shadow-md'
                        : 'border-border bg-surface-1 text-text hover:bg-surface-2 hover:shadow-sm dark:bg-surface-dark-1 dark:hover:bg-surface-dark-2'
                    }`}
                    title={isSelectionMode ? 'Exit selection mode' : 'Enter selection mode'}
                  >
                    <CheckSquare className="h-4 w-4" />
                    <span>{isSelectionMode ? 'Cancel Selection' : 'Select'}</span>
                  </button>
                )}
                {pagination.totalPages > 1 && (
                  <span className="inline-flex h-10 items-center rounded-lg border border-border/60 bg-surface-1 px-3 text-sm text-muted dark:border-border/40 dark:bg-surface-dark-1">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                )}
              </div>
            </div>
            <PhotoUploader
              ref={photoUploaderRef}
              galleryId={galleryId}
              onUploadComplete={handleUploadComplete}
              showDropzone={false}
            />
            {uploadError && (
              <div className="mt-2 text-danger bg-danger/10 dark:bg-danger/20 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                {uploadError}
                <button
                  onClick={() => setUploadError('')}
                  className="ml-2 text-xs text-accent-foreground bg-danger/80 hover:bg-danger px-2 py-1 rounded shadow-sm hover:shadow-md transition-all duration-200"
                >
                  Dismiss
                </button>
              </div>
            )}
            {error && (
              <div className="mt-2 text-danger bg-danger/10 dark:bg-danger/20 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                {error}
                <button
                  onClick={clearError}
                  className="ml-2 text-xs text-accent-foreground bg-danger/80 hover:bg-danger px-2 py-1 rounded shadow-sm hover:shadow-md transition-all duration-200"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          {/* Top Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mb-8 border-b border-border dark:border-border/40">
              <PaginationControls pagination={pagination} isLoading={isLoadingPhotos} />
            </div>
          )}

          {/* Selection Toolbar */}
          <PhotoSelectionBar
            isSelectionMode={isSelectionMode}
            hasSelection={selection.hasSelection}
            selectionCount={selection.count}
            areAllOnPageSelected={areAllOnPageSelected}
            onSelectAll={handleSelectAllPhotos}
            onCancel={() => {
              selection.clear();
              setIsSelectionMode(false);
            }}
            onDeleteMultiple={handleDeleteMultiplePhotosWrapper}
          />

          {/* Photos Grid or Loading State */}
          {isLoadingPhotos ? (
            <div className="flex flex-col items-center justify-center py-20 min-h-100">
              <Loader2 className="w-12 h-12 animate-spin text-accent mb-4" />
              <span className="text-lg text-muted">Loading photos...</span>
              <span className="text-sm text-muted/70 mt-1">Page {pagination.page}</span>
            </div>
          ) : photoUrls.length > 0 ? (
            <div
              className="grid grid-cols-1 gap-5 pt-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 lg:gap-6"
              ref={gridRef}
            >
              {photoUrls.map((photo, index) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  index={index}
                  isSelectionMode={isSelectionMode}
                  isSelected={selection.isSelected(photo.id)}
                  isCover={gallery.cover_photo_id === photo.id}
                  onToggleSelection={handleTogglePhotoSelection}
                  onOpenPhoto={openPhoto}
                  onSetCover={handleSetCover}
                  onClearCover={handleClearCover}
                  onRenamePhoto={handleRenamePhoto}
                  onDeletePhoto={handleDeletePhoto}
                />
              ))}
            </div>
          ) : (
            <EmptyGalleryState onUploadClick={() => photoUploaderRef.current?.openFilePicker()} />
          )}

          {/* Bottom Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mt-8 border-t border-border dark:border-border/40">
              <PaginationControls pagination={pagination} isLoading={isLoadingPhotos} />
            </div>
          )}
        </div>
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
