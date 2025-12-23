import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { galleryService, type GalleryDetail } from '../services/galleryService';
import { photoService, type PhotoResponse } from '../services/photoService';
import type { PhotoUploadResponse } from '../services/photoService';
import { shareLinkService, type ShareLink } from '../services/shareLinkService';
import { Layout } from '../components/Layout';
import { PhotoModal } from '../components/PhotoModal';
import { PhotoRenameModal } from '../components/PhotoRenameModal';
import { formatDateOnly } from '../lib/utils';
import {
  Loader2,
  Trash2,
  Share2,
  Link as LinkIcon,
  Copy,
  Check,
  Eye,
  Download,
  DownloadCloud,
  ArrowLeft,
  ImageOff,
  Star,
  StarOff,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
} from 'lucide-react';
import { PhotoUploader } from '../components/PhotoUploader';
import { useConfirmation, usePagination, useSelection, useModal, useErrorHandler } from '../hooks';

const numberFormatter = new Intl.NumberFormat();

export const GalleryPage = () => {
  const { id } = useParams<{ id: string }>();
  const galleryId = id!;

  // State
  const [gallery, setGallery] = useState<GalleryDetail | null>(null);
  const [photoUrls, setPhotoUrls] = useState<PhotoResponse[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [shootingDateInput, setShootingDateInput] = useState('');
  const [isSavingShootingDate, setIsSavingShootingDate] = useState(false);

  // Use new hooks
  const pagination = usePagination({ pageSize: 100, syncWithUrl: true });
  const selection = useSelection<string>();
  const renameModal = useModal<{ id: string; filename: string }>();
  const { error, clearError, handleError } = useErrorHandler();
  const { openConfirm, ConfirmModal } = useConfirmation();

  // Derived state
  const isSelectionMode = selection.hasSelection;
  const areAllOnPageSelected =
    photoUrls.length > 0 && photoUrls.every((p) => selection.isSelected(p.id));

  const fetchGalleryDetails = useCallback(
    async (page: number, isInitial = false) => {
      if (isInitial) {
        setIsInitialLoading(true);
      } else {
        setIsLoadingPhotos(true);
      }
      clearError();
      try {
        const offset = (page - 1) * pagination.pageSize;
        const galleryData = await galleryService.getGallery(galleryId, {
          limit: pagination.pageSize,
          offset,
        });
        setGallery(galleryData);
        setPhotoUrls(galleryData.photos || []);
        setShareLinks(galleryData.share_links || []);
        pagination.setTotal(galleryData.total_photos);
        const fallbackDate = galleryData.shooting_date || galleryData.created_at || '';
        setShootingDateInput(fallbackDate.slice(0, 10));
      } catch (err) {
        handleError(err);
      } finally {
        if (isInitial) {
          setIsInitialLoading(false);
        } else {
          setIsLoadingPhotos(false);
        }
      }
    },
    // Note: Don't include pagination object itself to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [galleryId, pagination.pageSize, pagination.setTotal, clearError, handleError],
  );

  useEffect(() => {
    const isInitial = gallery === null;
    fetchGalleryDetails(pagination.page, isInitial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, galleryId]);

  // Pagination component (reusable)
  const PaginationControls = () => {
    if (pagination.totalPages <= 1) return null;

    return (
      <div className="flex flex-col items-center gap-4 py-6">
        {/* Page info */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-base font-medium text-text">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <span className="text-sm text-muted">
            Showing {(pagination.page - 1) * pagination.pageSize + 1}-
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total} photo
            {pagination.total !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={pagination.previousPage}
            disabled={pagination.isFirstPage || isLoadingPhotos}
            className="flex items-center gap-2 px-5 py-2.5 bg-accent text-accent-foreground font-medium rounded-lg shadow-sm border border-accent/20 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-md transition-shadow duration-200"
          >
            {isLoadingPhotos ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
            Previous
          </button>

          {/* Page numbers */}
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
              let pageNum: number;

              // Show first pages, current page context, or last pages
              if (pagination.totalPages <= 5) {
                pageNum = i + 1;
              } else if (pagination.page <= 3) {
                pageNum = i + 1;
              } else if (pagination.page >= pagination.totalPages - 2) {
                pageNum = pagination.totalPages - 4 + i;
              } else {
                pageNum = pagination.page - 2 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => pagination.goToPage(pageNum)}
                  disabled={pageNum === pagination.page || isLoadingPhotos}
                  className={`px-3 py-1.5 min-w-[40px] rounded-lg font-medium transition-colors duration-200 ${pageNum === pagination.page
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'bg-surface-1 dark:bg-surface-dark-1 text-text hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-border dark:border-border/40'
                    } ${isLoadingPhotos ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={pagination.nextPage}
            disabled={pagination.isLastPage || isLoadingPhotos}
            className="flex items-center gap-2 px-5 py-2.5 bg-accent text-accent-foreground font-medium rounded-lg shadow-sm border border-accent/20 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-md transition-shadow duration-200"
          >
            Next
            {isLoadingPhotos ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ChevronRight className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    );
  };

  // Handler for photo upload completion - refresh photos without full page reload
  const handleUploadComplete = async (result: PhotoUploadResponse) => {
    setUploadError('');

    // Fetch only the first page of photos to get the newly uploaded ones
    if (result.successful_uploads > 0) {
      try {
        setIsLoadingPhotos(true);
        const offset = (pagination.page - 1) * pagination.pageSize;
        const galleryData = await galleryService.getGallery(galleryId, {
          limit: pagination.pageSize,
          offset,
        });
        setPhotoUrls(galleryData.photos || []);
        pagination.setTotal(galleryData.total_photos);
      } catch (err) {
        handleError(err);
      } finally {
        setIsLoadingPhotos(false);
      }
    }

    if (result.failed_uploads > 0) {
      setUploadError(`${result.failed_uploads} of ${result.total_files} photos failed to upload`);
    }
  };

  const handleSaveShootingDate = async () => {
    if (!shootingDateInput) return;

    setIsSavingShootingDate(true);
    clearError();
    try {
      const updated = await galleryService.updateGallery(galleryId, {
        shooting_date: shootingDateInput,
      });
      setGallery((prev) => (prev ? { ...prev, shooting_date: updated.shooting_date } : prev));
      setShootingDateInput(updated.shooting_date?.slice(0, 10) ?? shootingDateInput);
    } catch (err) {
      handleError(err);
    } finally {
      setIsSavingShootingDate(false);
    }
  };

  // Handler for renaming a photo
  // Handler for opening rename modal
  const handleRenamePhoto = (photoId: string, currentFilename: string) => {
    renameModal.open({ id: photoId, filename: currentFilename });
  };

  // Handler for actual rename operation
  const handleRenameConfirm = async (newFilename: string) => {
    if (!renameModal.data) return;

    await photoService.renamePhoto(galleryId, renameModal.data.id, newFilename);
    // Update filename locally without reloading all photos
    setPhotoUrls((prev) =>
      prev.map((photo) =>
        photo.id === renameModal.data!.id ? { ...photo, filename: newFilename } : photo,
      ),
    );
  };

  // Handler for closing rename modal
  const handleCloseRenameModal = () => {
    renameModal.close();
  };

  // Handler for deleting a photo
  const handleDeletePhoto = (photoId: string) => {
    openConfirm({
      title: 'Delete Photo',
      message: 'Are you sure you want to delete this photo? This action cannot be undone.',
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await photoService.deletePhoto(galleryId, photoId);
          setPhotoUrls((prev) => prev.filter((photo) => photo.id !== photoId));
        } catch (err) {
          handleError(err);
          throw err;
        }
      },
    });
  };

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
  const handleDeleteMultiplePhotos = () => {
    if (!selection.hasSelection) return;

    openConfirm({
      title: 'Delete Photos',
      message: `Are you sure you want to delete ${selection.count} photo${selection.count > 1 ? 's' : ''}? This action cannot be undone.`,
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await Promise.all(
            Array.from(selection.selectedIds).map((photoId) =>
              photoService.deletePhoto(galleryId, photoId),
            ),
          );
          setPhotoUrls((prev) => prev.filter((photo) => !selection.isSelected(photo.id)));
          selection.clear();
        } catch (err) {
          handleError(err);
          throw err;
        }
      },
    });
  };

  // Handler for deleting the gallery from detail page
  const handleDeleteGallery = () => {
    openConfirm({
      title: 'Delete Gallery',
      message:
        'Are you sure you want to delete this gallery and all its contents? This action cannot be undone.',
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await galleryService.deleteGallery(galleryId);
          window.location.href = '/';
        } catch (err) {
          handleError(err);
          throw err;
        }
      },
    });
  };

  // Handler for creating a share link
  const handleCreateShareLink = async () => {
    setIsCreatingLink(true);
    clearError();
    try {
      await shareLinkService.createShareLink(galleryId);
      // Refresh only share links without reloading photos
      const galleryData = await galleryService.getGallery(galleryId, { limit: 1, offset: 0 });
      setShareLinks(galleryData.share_links || []);
    } catch (err) {
      handleError(err);
    } finally {
      setIsCreatingLink(false);
    }
  };

  // Handler for deleting a share link
  const handleDeleteShareLink = (linkId: string) => {
    openConfirm({
      title: 'Delete Share Link',
      message: 'Are you sure you want to delete this share link?',
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await shareLinkService.deleteShareLink(galleryId, linkId);
          // Refresh only share links without reloading photos
          const galleryData = await galleryService.getGallery(galleryId, { limit: 1, offset: 0 });
          setShareLinks(galleryData.share_links || []);
        } catch (err) {
          handleError(err);
          throw err;
        }
      },
    });
  };

  // Handler for copying a link to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(text);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  // Photo modal handlers
  const openPhoto = (index: number) => {
    setSelectedPhotoIndex(index);
  };

  const closePhoto = () => {
    setSelectedPhotoIndex(null);
  };

  const goToPrevPhoto = () => {
    if (selectedPhotoIndex !== null) {
      const newIndex = selectedPhotoIndex > 0 ? selectedPhotoIndex - 1 : photoUrls.length - 1;
      setSelectedPhotoIndex(newIndex);
    }
  };

  const goToNextPhoto = () => {
    if (selectedPhotoIndex !== null) {
      const newIndex = selectedPhotoIndex < photoUrls.length - 1 ? selectedPhotoIndex + 1 : 0;
      setSelectedPhotoIndex(newIndex);
    }
  };

  const handleSetCover = async (photoId: string) => {
    try {
      await galleryService.setCoverPhoto(galleryId, photoId);
      // Update cover photo locally without reloading all photos
      setGallery((prev) => (prev ? { ...prev, cover_photo_id: photoId } : null));
    } catch (err) {
      handleError(err);
    }
  };

  const handleClearCover = async () => {
    try {
      await galleryService.clearCoverPhoto(galleryId);
      // Update cover photo locally without reloading all photos
      setGallery((prev) => (prev ? { ...prev, cover_photo_id: null } : null));
    } catch (err) {
      handleError(err);
    }
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
            <div>
              <Link to="/" className="text-accent dark:text-accent hover:underline text-sm">
                ← Back to Dashboard
              </Link>
            </div>
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

  const totalViews = shareLinks.reduce((sum, link) => sum + (link.views ?? 0), 0);
  const totalZipDownloads = shareLinks.reduce((sum, link) => sum + (link.zip_downloads ?? 0), 0);
  const totalDownloads = shareLinks.reduce(
    (sum, link) => sum + (link.zip_downloads ?? 0) + (link.single_downloads ?? 0),
    0,
  );

  const summaryMetrics = [
    { label: 'Total Views', value: totalViews, icon: Eye },
    { label: 'ZIP Downloads', value: totalZipDownloads, icon: DownloadCloud },
    { label: 'Total Downloads', value: totalDownloads, icon: Download },
  ];

  return (
    <Layout>
      <div className="space-y-8">
        {/* ... (keep existing header section) */}
        <div className="flex flex-col gap-4">
          <div>
            <Link
              to="/"
              className="flex items-center gap-2 text-sm text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Galleries
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold text-text">
                  {gallery.name || `Gallery #${gallery.id}`}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
                  <label className="text-xs uppercase tracking-wide text-muted font-semibold">
                    Shooting date
                  </label>
                  <input
                    type="date"
                    value={shootingDateInput}
                    onChange={(e) => setShootingDateInput(e.target.value)}
                    className="rounded-lg border border-border dark:border-border/40 bg-transparent px-3 py-2 text-text shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <button
                    onClick={handleSaveShootingDate}
                    disabled={
                      isSavingShootingDate ||
                      !shootingDateInput ||
                      shootingDateInput === gallery.shooting_date?.slice(0, 10)
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-sm disabled:hover:translate-y-0"
                  >
                    {isSavingShootingDate ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Save date
                  </button>
                  <span className="text-xs text-muted">
                    Created on {formatDateOnly(gallery.created_at)}
                  </span>
                </div>
              </div>
              <button
                onClick={handleDeleteGallery}
                className="flex items-center gap-2 px-4 py-2 bg-danger/10 dark:bg-danger/20 hover:bg-danger/20 text-danger border border-danger/20 rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-1 active:scale-95"
                title="Delete Gallery"
                aria-label="Delete gallery"
              >
                <Trash2 className="w-4 h-4" />
                Delete Gallery
              </button>
            </div>
          </div>
        </div>

        {/* Photo Section */}
        <div
          className="bg-surface dark:bg-surface-foreground/5 rounded-2xl p-4 lg:p-6 xl:p-8 border border-border dark:border-border/10"
          data-photos-section
        >
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-semibold text-text">
                Photos
                {pagination.total > 0 && (
                  <span className="ml-2 text-lg text-muted font-normal">
                    ({photoUrls.length} of {pagination.total})
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                {photoUrls.length > 0 && (
                  <button
                    onClick={() => {
                      if (isSelectionMode) {
                        selection.clear();
                      }
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${isSelectionMode
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-surface-foreground dark:bg-surface text-text hover:bg-surface-foreground/80 dark:hover:bg-surface/80 border border-border'
                      }`}
                    title="Toggle multi-select mode"
                  >
                    <CheckSquare className="w-4 h-4" />
                    <span className="text-sm font-medium">Select</span>
                  </button>
                )}
                {pagination.totalPages > 1 && (
                  <span className="text-sm text-muted">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                )}
              </div>
            </div>
            <PhotoUploader galleryId={galleryId} onUploadComplete={handleUploadComplete} />
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
            <div className="border-b border-border dark:border-border/40 mb-6">
              <PaginationControls />
            </div>
          )}

          {/* Selection Toolbar */}
          {(isSelectionMode || selection.hasSelection) && (
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSelectAllPhotos}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-lg transition-all duration-200"
                  title={areAllOnPageSelected ? 'Deselect all on page' : 'Select all on page'}
                >
                  {areAllOnPageSelected ? (
                    <>
                      <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        Deselect Page
                      </span>
                    </>
                  ) : (
                    <>
                      <Square className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        Select Page
                      </span>
                    </>
                  )}
                </button>
                <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                  {selection.count} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={selection.clear}
                  className="px-3 py-2 bg-white dark:bg-surface hover:bg-gray-100 dark:hover:bg-surface-foreground text-gray-700 dark:text-text rounded-lg text-sm font-medium transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteMultiplePhotos}
                  disabled={!selection.hasSelection}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete {selection.count > 0 ? `(${selection.count})` : ''}
                </button>
              </div>
            </div>
          )}

          {/* Photos Grid or Loading State */}
          {isLoadingPhotos ? (
            <div className="flex flex-col items-center justify-center py-20 min-h-[400px]">
              <Loader2 className="w-12 h-12 animate-spin text-accent mb-4" />
              <span className="text-lg text-muted">Loading photos...</span>
              <span className="text-sm text-muted/70 mt-1">Page {pagination.page}</span>
            </div>
          ) : photoUrls.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 lg:gap-8 pt-14">
              {photoUrls.map((photo, index) => (
                <div
                  key={photo.id}
                  className="group bg-surface dark:bg-surface-foreground rounded-lg flex flex-col relative overflow-visible"
                >
                  {/* Selection checkbox */}
                  {isSelectionMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePhotoSelection(photo.id, e.shiftKey);
                      }}
                      className={`absolute top-2 left-2 z-10 p-2 rounded-lg transition-colors duration-200 ${selection.isSelected(photo.id)
                        ? 'bg-blue-500 text-white'
                        : 'bg-white/90 dark:bg-black/50 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-black/70'
                        }`}
                      title={selection.isSelected(photo.id) ? 'Deselect' : 'Select'}
                    >
                      {selection.isSelected(photo.id) ? (
                        <CheckSquare className="w-5 h-5" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  )}

                  {/* Image area */}
                  <div className="relative h-80">
                    {/* Action Panel - floating pop-up above container */}
                    <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 z-20 popup-container opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      {/* Pop-up arrow */}
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent popup-arrow"></div>

                      <div className="flex justify-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openPhoto(index);
                          }}
                          className="popup-action popup-action--accent"
                          title="Open photo"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                            />
                          </svg>
                        </button>
                        {gallery.cover_photo_id === photo.id ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClearCover();
                            }}
                            className="popup-action popup-action--warning"
                            title="Clear cover photo"
                          >
                            <StarOff className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetCover(photo.id);
                            }}
                            className="popup-action popup-action--warning"
                            title="Set as cover"
                          >
                            <Star className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRenamePhoto(photo.id, photo.filename);
                          }}
                          className="popup-action popup-action--accent"
                          title="Rename photo"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            // Download functionality using fetch to force download dialog
                            try {
                              const response = await fetch(photo.url);
                              const blob = await response.blob();

                              const url = window.URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = photo.filename;
                              document.body.appendChild(link);
                              link.click();

                              // Cleanup
                              document.body.removeChild(link);
                              window.URL.revokeObjectURL(url);
                            } catch (error) {
                              console.error('Failed to download photo:', error);
                            }
                          }}
                          className="popup-action popup-action--success"
                          title="Download photo"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePhoto(photo.id);
                          }}
                          className="popup-action popup-action--danger"
                          title="Delete photo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Photo - takes full image area */}
                    <button
                      onClick={() => openPhoto(index)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleRenamePhoto(photo.id, photo.filename);
                      }}
                      className="w-full h-full p-0 border-0 bg-transparent cursor-pointer absolute inset-0"
                      aria-label={`Photo ${photo.id}`}
                      title="Click to view, double-click to rename"
                    >
                      <img
                        src={photo.thumbnail_url}
                        alt={`Photo ${photo.id}`}
                        className="w-full h-full object-contain rounded-t-lg transition-opacity"
                        loading="lazy"
                      />
                    </button>
                  </div>

                  {/* Caption below the image (not overlapping) */}
                  <div className="px-2 py-2">
                    <p className="text-xs text-muted truncate text-center" title={photo.filename}>
                      {photo.filename}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 border-2 border-dashed border-border dark:border-border/40 rounded-lg">
              <ImageOff className="mx-auto h-12 w-12 text-muted dark:text-muted-dark" />
              <h3 className="mt-4 text-lg font-medium text-muted">No photos in this gallery</h3>
              <p className="mt-2 text-sm text-muted">Upload your first photo to get started.</p>
            </div>
          )}

          {/* Bottom Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mt-8 border-t border-border dark:border-border/40">
              <PaginationControls />
            </div>
          )}
        </div>
        <div className="bg-surface-1 dark:bg-surface-dark-1 rounded-2xl p-6 border border-border dark:border-border/40">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-semibold text-text">Share Links</h2>
              <button
                onClick={handleCreateShareLink}
                disabled={isCreatingLink}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground font-medium rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-accent/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none gallery-create__btn cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 active:scale-95"
                id="gallery-create-btn"
                aria-label="Create new share link"
              >
                {isCreatingLink ? (
                  <Loader2 className="w-5 h-5 animate-spin text-accent-foreground" />
                ) : (
                  <Share2 className="w-5 h-5 text-accent-foreground" />
                )}
                <span className="text-accent-foreground">Create New Link</span>
              </button>
            </div>
          </div>

          {shareLinks.length > 0 ? (
            <>
              <div
                data-testid="share-link-stats-summary"
                className="grid gap-2.5 mb-4 sm:grid-cols-2 xl:grid-cols-4"
              >
                {summaryMetrics.map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <div
                      key={metric.label}
                      className="flex items-center gap-2.5 rounded-lg border border-border/70 dark:border-border/50 bg-surface-1/80 dark:bg-surface-dark-2/70 p-2.5 sm:p-3"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent">
                        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                      </div>
                      <div className="space-y-0.5 leading-none">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-text/75 dark:text-accent-foreground/90">
                          {metric.label}
                        </p>
                        <p className="text-sm font-semibold text-text dark:text-accent-foreground">
                          {numberFormatter.format(metric.value)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <ul className="space-y-3">
                {shareLinks.map((link) => {
                  const fullUrl = `${window.location.origin}/share/${link.id}`;
                  const zipDownloads = link.zip_downloads ?? 0;
                  const totalLinkDownloads = zipDownloads + (link.single_downloads ?? 0);
                  const linkMetrics = [
                    { label: 'Views', value: link.views ?? 0, icon: Eye },
                    { label: 'ZIP', value: zipDownloads, icon: DownloadCloud }, // Single downloads removed
                    { label: 'Total', value: totalLinkDownloads, icon: Download },
                  ];
                  return (
                    <li
                      key={link.id}
                      className="bg-surface-1 dark:bg-surface-dark-1 p-4 rounded-lg border border-border dark:border-border flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6 flex-1 min-w-0">
                        <div className="flex items-center gap-4 min-w-0">
                          <LinkIcon className="w-5 h-5 text-accent gallery-link__icon" />
                          <a
                            href={fullUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline truncate gallery-link__anchor"
                          >
                            {fullUrl}
                          </a>
                        </div>
                        <div
                          data-testid={`share-link-${link.id}-metrics`}
                          className="grid w-full gap-2 text-xs sm:text-sm min-[420px]:grid-cols-2 lg:flex lg:flex-wrap lg:w-auto lg:items-center"
                        >
                          {linkMetrics.map((metric) => {
                            const Icon = metric.icon;
                            return (
                              <div
                                key={metric.label}
                                className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-surface-1/80 px-2.5 py-1.5 leading-tight dark:border-border/50 dark:bg-surface-dark-2/70"
                              >
                                <span className="flex items-center gap-1.5">
                                  <Icon
                                    className="h-3.5 w-3.5 text-text/70 dark:text-accent-foreground/80"
                                    aria-hidden="true"
                                  />
                                  <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-text/70 dark:text-accent-foreground/75">
                                    {metric.label}
                                  </span>
                                </span>
                                <span className="text-sm font-semibold text-text dark:text-accent-foreground">
                                  {numberFormatter.format(metric.value)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyToClipboard(fullUrl)}
                          className="flex items-center justify-center w-8 h-8 p-1 bg-success/20 hover:bg-success/30 text-success rounded-lg transition-all duration-200 border border-border gallery-copy__btn cursor-pointer hover:scale-105 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 active:scale-95"
                          title="Copy link"
                          aria-label="Copy link"
                        >
                          {copiedLink === fullUrl ? (
                            <Check className="w-4 h-4 text-success" />
                          ) : (
                            <Copy className="w-4 h-4 text-success" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteShareLink(link.id)}
                          className="flex items-center justify-center w-8 h-8 p-1 bg-danger/20 hover:bg-danger/30 text-danger rounded-lg transition-all duration-200 border border-border cursor-pointer hover:scale-105 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 active:scale-95"
                          aria-label="Delete share link"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-border dark:border-border/40 rounded-lg">
              <Share2 className="mx-auto h-12 w-12 text-muted" />
              <h3 className="mt-4 text-lg font-medium text-muted">No share links created</h3>
              <p className="mt-2 text-sm text-muted">
                Create a link to share this gallery with others.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Photo Modal */}
      <PhotoModal
        photos={photoUrls.map((p) => ({
          id: p.id,
          url: p.url,
          created_at: '',
          gallery_id: galleryId,
        }))}
        selectedIndex={selectedPhotoIndex}
        onClose={closePhoto}
        onPrevious={goToPrevPhoto}
        onNext={goToNextPhoto}
        isPublic={false}
      />

      {/* Photo Rename Modal */}
      <PhotoRenameModal
        isOpen={renameModal.isOpen}
        onClose={handleCloseRenameModal}
        currentFilename={renameModal.data?.filename || ''}
        onRename={handleRenameConfirm}
      />

      {/* Confirmation Modal */}
      {ConfirmModal}
    </Layout>
  );
};
