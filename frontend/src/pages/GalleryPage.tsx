import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
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
import type { GalleryPhotoSortBy, SortOrder } from '../types';

const DEFAULT_SORT_BY: GalleryPhotoSortBy = 'uploaded_at';
const DEFAULT_SORT_ORDER: SortOrder = 'desc';
const DEFAULT_PUBLIC_SORT_BY: GalleryPhotoSortBy = 'original_filename';
const DEFAULT_PUBLIC_SORT_ORDER: SortOrder = 'asc';
const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_INPUT_ID = 'gallery-photo-search';

const isGalleryPhotoSortBy = (value: string | null): value is GalleryPhotoSortBy =>
  value === 'uploaded_at' || value === 'original_filename' || value === 'file_size';

const normalizeSortByParam = (value: string | null): GalleryPhotoSortBy | null => {
  if (value === 'created_at') {
    return 'uploaded_at';
  }

  return isGalleryPhotoSortBy(value) ? value : null;
};

const isSortOrder = (value: string | null): value is SortOrder =>
  value === 'asc' || value === 'desc';

export const GalleryPage = () => {
  const { id } = useParams<{ id: string }>();
  const galleryId = id!;
  const [searchParams, setSearchParams] = useSearchParams();

  const urlSearch = searchParams.get('search') ?? '';
  const activeSearch = urlSearch.trim();
  const sortByParam = searchParams.get('sort_by');
  const orderParam = searchParams.get('order');
  const sortBy: GalleryPhotoSortBy = normalizeSortByParam(sortByParam) ?? DEFAULT_SORT_BY;
  const sortOrder: SortOrder = isSortOrder(orderParam) ? orderParam : DEFAULT_SORT_ORDER;

  const [searchInput, setSearchInput] = useState(urlSearch);
  const [publicSortByInput, setPublicSortByInput] =
    useState<GalleryPhotoSortBy>(DEFAULT_PUBLIC_SORT_BY);
  const [publicSortOrderInput, setPublicSortOrderInput] =
    useState<SortOrder>(DEFAULT_PUBLIC_SORT_ORDER);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showInitialLoadingState, setShowInitialLoadingState] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [photoSizeById, setPhotoSizeById] = useState<Record<string, number>>({});
  const gridRef = useRef<HTMLDivElement | null>(null);
  const photoUploaderRef = useRef<PhotoUploaderHandle | null>(null);

  // Use new hooks
  const pagination = usePagination({ pageSize: 100, syncWithUrl: true });
  const selection = useSelection<string>();

  const updateFilterQueryParams = useCallback(
    (updates: {
      search?: string | null;
      sortBy?: GalleryPhotoSortBy;
      order?: SortOrder;
      resetPage?: boolean;
    }) => {
      const nextParams = new URLSearchParams(searchParams);

      if (updates.search !== undefined) {
        if (updates.search) {
          nextParams.set('search', updates.search);
        } else {
          nextParams.delete('search');
        }
      }

      if (updates.sortBy !== undefined) {
        if (updates.sortBy === DEFAULT_SORT_BY) {
          nextParams.delete('sort_by');
        } else {
          nextParams.set('sort_by', updates.sortBy);
        }
      }

      if (updates.order !== undefined) {
        if (updates.order === DEFAULT_SORT_ORDER) {
          nextParams.delete('order');
        } else {
          nextParams.set('order', updates.order);
        }
      }

      if (updates.resetPage) {
        nextParams.set('page', '1');
      }

      if (nextParams.toString() !== searchParams.toString()) {
        setSearchParams(nextParams);
      }
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const normalizedSearch = searchInput.trim();
      if (normalizedSearch !== activeSearch) {
        updateFilterQueryParams({
          search: normalizedSearch || null,
          resetPage: true,
        });
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput, activeSearch, updateFilterQueryParams]);

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
    isSavingPublicSortSettings,
    error,
    clearError,
    ConfirmModal,
    renameModal,
    fetchGalleryDetails,
    fetchShareLinks,
    handleUploadComplete,
    handleSaveShootingDate,
    handleSavePublicSortSettings,
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
  } = useGalleryActions({
    galleryId,
    filters: {
      search: activeSearch || undefined,
      sort_by: sortBy,
      order: sortOrder,
    },
    pagination,
  });

  useEffect(() => {
    if (!gallery) {
      return;
    }

    setPublicSortByInput(gallery.public_sort_by ?? DEFAULT_PUBLIC_SORT_BY);
    setPublicSortOrderInput(gallery.public_sort_order ?? DEFAULT_PUBLIC_SORT_ORDER);
  }, [gallery]);

  const currentGalleryShootingDate = gallery?.shooting_date?.slice(0, 10) ?? '';
  const currentPublicSortBy = gallery?.public_sort_by ?? DEFAULT_PUBLIC_SORT_BY;
  const currentPublicSortOrder = gallery?.public_sort_order ?? DEFAULT_PUBLIC_SORT_ORDER;

  useEffect(() => {
    if (!gallery || isSavingShootingDate) {
      return;
    }

    if (shootingDateInput === currentGalleryShootingDate) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void handleSaveShootingDate(shootingDateInput);
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    gallery,
    isSavingShootingDate,
    shootingDateInput,
    currentGalleryShootingDate,
    handleSaveShootingDate,
  ]);

  useEffect(() => {
    if (!gallery || isSavingPublicSortSettings) {
      return;
    }

    if (
      publicSortByInput === currentPublicSortBy &&
      publicSortOrderInput === currentPublicSortOrder
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void handleSavePublicSortSettings(publicSortByInput, publicSortOrderInput);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    gallery,
    isSavingPublicSortSettings,
    publicSortByInput,
    publicSortOrderInput,
    currentPublicSortBy,
    currentPublicSortOrder,
    handleSavePublicSortSettings,
  ]);

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
  }, [pagination.page, galleryId, activeSearch, sortBy, sortOrder]);

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

      const searchElement = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null;
      const isSearchFocused = searchElement === document.activeElement;

      if (
        !isTypingTarget &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key === '/'
      ) {
        event.preventDefault();
        searchElement?.focus();
        searchElement?.select();
        return;
      }

      if (
        !isTypingTarget &&
        event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'f'
      ) {
        event.preventDefault();
        window.dispatchEvent(new Event('gallery:open-public-sort'));
        return;
      }

      if (event.key === 'Escape' && !isSelectionMode && searchInput.trim().length > 0) {
        if (!isTypingTarget || isSearchFocused) {
          event.preventDefault();
          setSearchInput('');
          updateFilterQueryParams({ search: null, resetPage: true });
          if (isSearchFocused) {
            searchElement?.blur();
          }
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [isSelectionMode, searchInput, updateFilterQueryParams]);

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
          visiblePhotoCount={photoUrls.length}
          totalPhotoCount={pagination.total}
          isLoadingPhotos={isLoadingPhotos}
          shootingDateInput={shootingDateInput}
          onShootingDateChange={setShootingDateInput}
          isSavingShootingDate={isSavingShootingDate}
          publicSortBy={publicSortByInput}
          publicSortOrder={publicSortOrderInput}
          onPublicSortChange={({
            sortBy: nextSortBy,
            sortOrder: nextSortOrder,
          }: {
            sortBy: GalleryPhotoSortBy;
            sortOrder: SortOrder;
          }) => {
            setPublicSortByInput(nextSortBy);
            setPublicSortOrderInput(nextSortOrder);
          }}
          isSavingPublicSortSettings={isSavingPublicSortSettings}
          searchValue={searchInput}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onDeleteGallery={handleDeleteGallery}
          onSearchChange={setSearchInput}
          onSortChange={({
            sortBy: nextSortBy,
            sortOrder: nextSortOrder,
          }: {
            sortBy: GalleryPhotoSortBy;
            sortOrder: SortOrder;
          }) => {
            updateFilterQueryParams({
              sortBy: nextSortBy,
              order: nextSortOrder,
              resetPage: true,
            });
          }}
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
            activeSearchTerm: activeSearch || undefined,
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
            isPhotoSelected: (id: string) => selection.isSelected(id),
            isCoverPhoto: (photoId: string | null | undefined) =>
              gallery.cover_photo_id === photoId,
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
            onClearSearch: () => {
              setSearchInput('');
              updateFilterQueryParams({ search: null, resetPage: true });
            },
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
