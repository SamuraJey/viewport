import React from 'react';
import { Loader2, SearchX } from 'lucide-react';
import type { MutableRefObject, RefObject } from 'react';
import { PaginationControls } from '../PaginationControls';
import { EmptyGalleryState } from './EmptyGalleryState';
import { PhotoCard } from './PhotoCard';
import { PhotoSelectionBar } from './PhotoSelectionBar';
import { PhotoUploader, type PhotoUploaderHandle } from '../PhotoUploader';
import { formatFileSize } from '../../lib/utils';
import type { PhotoUploadResponse, GalleryPhoto } from '../../types';

interface GalleryPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  isFirstPage: boolean;
  isLastPage: boolean;
  nextPage: () => void;
  previousPage: () => void;
  goToPage: (page: number) => void;
}

interface GalleryPhotoSectionProps {
  galleryId: string;
  pagination: GalleryPagination;
  gridRef: MutableRefObject<HTMLDivElement | null>;
  photoUploaderRef: RefObject<PhotoUploaderHandle | null>;
  onModalStateChange?: (isOpen: boolean) => void;
  state: {
    photoUrls: GalleryPhoto[];
    isLoadingPhotos: boolean;
    isDownloadingZip?: boolean;
    activeSearchTerm?: string;
    uploadError: string | null;
    actionInfo: string | null;
    error: string | null;
    isSelectionMode: boolean;
  };
  selection: {
    areAllOnPageSelected: boolean;
    selectionCount: number;
    selectedSizeBytes: number;
    hasSelection: boolean;
    isPhotoSelected: (photoId: string) => boolean;
    isCoverPhoto: (photoId: string) => boolean;
  };
  actions: {
    onUploadComplete: (result: PhotoUploadResponse) => void;
    onDismissUploadError: () => void;
    onDismissActionInfo: () => void;
    onDismissError: () => void;
    onTogglePhotoSelection: (photoId: string, isShiftKey: boolean) => void;
    onOpenPhoto: (index: number) => void;
    onSetCover: (photoId: string) => void;
    onClearCover: () => void;
    onRenamePhoto: (photoId: string, filename: string) => void;
    onDeletePhoto: (photoId: string) => void;
    onDownloadSelectedPhotos: () => void;
    onClearSearch: () => void;
    onSelectAllPhotos: () => void;
    onCancelSelection: () => void;
    onDeleteMultiplePhotos: () => void;
  };
}

const PHOTO_GRID_SKELETON_CARDS = 10;

const GalleryPhotoGridSkeleton = ({ page, renderNonce }: { page: number; renderNonce: number }) => (
  <div className="pt-4" data-testid="private-gallery-skeleton-grid">
    <div className="mb-4 flex items-center gap-3 text-muted">
      <Loader2 className="h-5 w-5 animate-spin text-accent" />
      <span className="text-sm font-bold uppercase tracking-wide">Loading photos</span>
      <span className="text-xs font-semibold text-muted/70">Page {page}</span>
    </div>
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 sm:gap-4">
      {Array.from({ length: PHOTO_GRID_SKELETON_CARDS }).map((_, index) => (
        <div
          key={`photo-skeleton-${renderNonce}-${index}`}
          className="overflow-hidden rounded-2xl border border-border/45 bg-surface shadow-xs dark:border-border/35 dark:bg-surface-dark-1"
        >
          <div className="h-64 p-4 sm:h-72 md:h-80">
            <div className="h-full w-full animate-pulse rounded-xl bg-linear-to-br from-surface-foreground/15 via-surface-foreground/10 to-surface-foreground/15 dark:from-surface/30 dark:via-surface/20 dark:to-surface/30" />
          </div>
          <div className="border-t border-border/40 px-4 py-4 dark:border-border/30">
            <div className="h-3.5 w-3/4 animate-pulse rounded-full bg-surface-foreground/20 dark:bg-surface/30" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

const GalleryPhotoSectionComponent = ({
  galleryId,
  pagination,
  gridRef,
  photoUploaderRef,
  onModalStateChange,
  state,
  selection,
  actions,
}: GalleryPhotoSectionProps) => {
  const shouldShowGridSkeleton = state.isLoadingPhotos;
  const [skeletonRenderNonce, setSkeletonRenderNonce] = React.useState(0);
  const previousLoadingPhotosRef = React.useRef(state.isLoadingPhotos);

  React.useEffect(() => {
    const startedLoading = state.isLoadingPhotos && !previousLoadingPhotosRef.current;
    if (startedLoading) {
      setSkeletonRenderNonce((value) => value + 1);
    }
    previousLoadingPhotosRef.current = state.isLoadingPhotos;
  }, [state.isLoadingPhotos]);

  React.useEffect(() => {
    if (shouldShowGridSkeleton) {
      setSkeletonRenderNonce((value) => value + 1);
    }
  }, [pagination.page, state.activeSearchTerm, shouldShowGridSkeleton]);

  return (
    <section
      className="px-0 py-0"
      data-photos-section
      aria-labelledby="private-gallery-photos-heading"
    >
      <h2 id="private-gallery-photos-heading" className="sr-only">
        Photos {state.photoUrls.length}
      </h2>
      <div className="mb-4">
        <PhotoUploader
          ref={photoUploaderRef}
          galleryId={galleryId}
          onUploadComplete={actions.onUploadComplete}
          existingFilenames={state.photoUrls.map((photo) => photo.filename)}
          showDropzone={false}
          onModalStateChange={onModalStateChange}
        />
        {state.uploadError && (
          <div className="mt-3 text-danger bg-danger/10 dark:bg-danger/20 px-4 py-3 rounded-xl text-sm flex items-center gap-3 shadow-xs">
            {state.uploadError}
            <button
              type="button"
              onClick={actions.onDismissUploadError}
              className="ml-auto text-xs font-bold text-accent-foreground bg-danger/80 hover:bg-danger px-3 py-1.5 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Dismiss
            </button>
          </div>
        )}
        {state.actionInfo && (
          <div className="mt-3 text-amber-900 dark:text-amber-200 bg-amber-100/80 dark:bg-amber-900/40 px-4 py-3 rounded-xl text-sm flex items-center gap-3 shadow-xs border border-amber-200/80 dark:border-amber-700/60">
            {state.actionInfo}
            <button
              type="button"
              onClick={actions.onDismissActionInfo}
              className="ml-auto text-xs font-bold text-amber-900 dark:text-amber-100 bg-amber-200/80 dark:bg-amber-800/70 hover:bg-amber-300 dark:hover:bg-amber-700 px-3 py-1.5 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Dismiss
            </button>
          </div>
        )}
        {state.error && (
          <div className="mt-3 text-danger bg-danger/10 dark:bg-danger/20 px-4 py-3 rounded-xl text-sm flex items-center gap-3 shadow-xs">
            {state.error}
            <button
              type="button"
              onClick={actions.onDismissError}
              className="ml-auto text-xs font-bold text-accent-foreground bg-danger/80 hover:bg-danger px-3 py-1.5 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {pagination.totalPages > 1 && (
        <div className="mb-4 border-b border-border/35 pb-4 dark:border-border/25">
          <PaginationControls pagination={pagination} isLoading={state.isLoadingPhotos} />
        </div>
      )}

      <PhotoSelectionBar
        isSelectionMode={state.isSelectionMode}
        hasSelection={selection.hasSelection}
        selectionCount={selection.selectionCount}
        selectedSizeLabel={formatFileSize(selection.selectedSizeBytes)}
        isDownloadingZip={state.isDownloadingZip}
        areAllOnPageSelected={selection.areAllOnPageSelected}
        onSelectAll={actions.onSelectAllPhotos}
        onCancel={actions.onCancelSelection}
        onDownloadSelected={actions.onDownloadSelectedPhotos}
        onDeleteMultiple={actions.onDeleteMultiplePhotos}
      />

      {shouldShowGridSkeleton ? (
        <GalleryPhotoGridSkeleton page={pagination.page} renderNonce={skeletonRenderNonce} />
      ) : state.photoUrls.length > 0 ? (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 pt-4 sm:gap-4"
          ref={gridRef}
        >
          {state.photoUrls.map((photo, index) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              index={index}
              isSelectionMode={state.isSelectionMode}
              isSelected={selection.isPhotoSelected(photo.id)}
              isCover={selection.isCoverPhoto(photo.id)}
              onToggleSelection={actions.onTogglePhotoSelection}
              onOpenPhoto={actions.onOpenPhoto}
              onSetCover={actions.onSetCover}
              onClearCover={actions.onClearCover}
              onRenamePhoto={actions.onRenamePhoto}
              onDeletePhoto={actions.onDeletePhoto}
            />
          ))}
        </div>
      ) : state.activeSearchTerm ? (
        <div className="flex min-h-96 flex-col items-center justify-center rounded-3xl border border-dashed border-border/40 bg-surface-1/50 px-6 py-16 text-center dark:border-border/30 dark:bg-surface-dark-1/50">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border/40 bg-surface text-muted dark:border-border/30 dark:bg-surface-dark-2">
            <SearchX className="h-8 w-8" />
          </div>
          <h3 className="mt-5 text-xl font-bold text-text">No results found</h3>
          <p className="mt-2 max-w-md text-sm font-medium text-muted">
            No photos found for &quot;{state.activeSearchTerm}&quot;.
          </p>
          <button
            type="button"
            onClick={actions.onClearSearch}
            className="mt-6 inline-flex h-11 items-center rounded-xl border border-border/50 bg-surface px-5 text-sm font-bold text-text transition-all duration-200 hover:border-accent/40 hover:text-accent hover:-translate-y-0.5 hover:shadow-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:border-border/40 dark:bg-surface-dark-1"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="pt-4">
          <EmptyGalleryState onUploadClick={() => photoUploaderRef.current?.openFilePicker()} />
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="mt-6 border-t border-border/35 pt-4 dark:border-border/25">
          <PaginationControls pagination={pagination} isLoading={state.isLoadingPhotos} />
        </div>
      )}
    </section>
  );
};

export const GalleryPhotoSection = React.memo(GalleryPhotoSectionComponent);
