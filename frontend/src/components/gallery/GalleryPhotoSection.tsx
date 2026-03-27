import React from 'react';
import { CheckSquare, Download, Loader2, SearchX, Upload } from 'lucide-react';
import type { MutableRefObject, RefObject } from 'react';
import { PaginationControls } from '../PaginationControls';
import { EmptyGalleryState } from './EmptyGalleryState';
import { PhotoCard } from './PhotoCard';
import { PhotoSelectionBar } from './PhotoSelectionBar';
import { PhotoUploader, type PhotoUploaderHandle } from '../PhotoUploader';
import { MAX_UPLOAD_FILE_SIZE_MB } from '../../constants/upload';
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
    gallerySizeBytes: number;
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
    onToggleSelectionMode: () => void;
    onTogglePhotoSelection: (photoId: string, isShiftKey: boolean) => void;
    onOpenPhoto: (index: number) => void;
    onSetCover: (photoId: string) => void;
    onClearCover: () => void;
    onRenamePhoto: (photoId: string, filename: string) => void;
    onDeletePhoto: (photoId: string) => void;
    onDownloadGallery: () => void;
    onDownloadSelectedPhotos: () => void;
    onClearSearch: () => void;
    onSelectAllPhotos: () => void;
    onCancelSelection: () => void;
    onDeleteMultiplePhotos: () => void;
  };
}

const GalleryPhotoSectionComponent = ({
  galleryId,
  pagination,
  gridRef,
  photoUploaderRef,
  onModalStateChange,
  state,
  selection,
  actions,
}: GalleryPhotoSectionProps) => (
  <div
    className="bg-surface dark:bg-surface-dark-1/80 rounded-3xl p-6 lg:p-8 border border-border/50 dark:border-border/40 shadow-xs"
    data-photos-section
  >
    <div className="mb-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold text-text flex items-center gap-3">
          Photos
          {state.photoUrls.length > 0 && (
            <span className="text-sm text-muted font-bold bg-surface-1 dark:bg-surface-dark-1 px-3 py-1 rounded-xl border border-border/50 shadow-inner">
              {state.photoUrls.length}
            </span>
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => photoUploaderRef.current?.openFilePicker()}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-transparent bg-accent px-5 text-sm font-bold text-accent-foreground transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-sm active:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            title={`Add photos (JPG/PNG up to ${MAX_UPLOAD_FILE_SIZE_MB} MB)`}
          >
            <Upload className="h-4 w-4" />
            Add Photos
          </button>
          {state.photoUrls.length > 0 && (
            <button
              onClick={actions.onDownloadGallery}
              disabled={state.isDownloadingZip}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-5 text-sm font-bold text-text transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border/50 disabled:hover:text-text disabled:hover:translate-y-0 disabled:hover:shadow-none focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:border-border/40 dark:bg-surface-dark-1"
              title={`Download entire gallery as ZIP (${formatFileSize(state.gallerySizeBytes)})`}
            >
              <Download className="h-4 w-4" />
              Download ZIP
            </button>
          )}
          {state.photoUrls.length > 0 && (
            <button
              onClick={actions.onToggleSelectionMode}
              className={`inline-flex h-11 items-center gap-2 rounded-xl border px-5 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                state.isSelectionMode
                  ? 'border-accent bg-accent text-accent-foreground shadow-sm hover:brightness-110'
                  : 'border-border/35 bg-transparent text-muted hover:border-border/60 hover:bg-surface-1 hover:text-text dark:border-border/30 dark:hover:bg-surface-dark-1'
              }`}
              title={state.isSelectionMode ? 'Exit selection mode' : 'Enter selection mode'}
            >
              <CheckSquare className="h-4 w-4" />
              <span>{state.isSelectionMode ? 'Cancel Selection' : 'Select'}</span>
            </button>
          )}
          {pagination.totalPages > 1 && (
            <span className="inline-flex h-11 items-center rounded-xl border border-border/60 bg-surface-1 px-4 text-sm font-bold text-muted dark:border-border/40 dark:bg-surface-dark-1 shadow-inner">
              Page {pagination.page} of {pagination.totalPages}
            </span>
          )}
        </div>
      </div>
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
            onClick={actions.onDismissError}
            className="ml-auto text-xs font-bold text-accent-foreground bg-danger/80 hover:bg-danger px-3 py-1.5 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>

    {pagination.totalPages > 1 && (
      <div className="mb-8 border-b border-border/50 dark:border-border/30 pb-6">
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

    {state.isLoadingPhotos ? (
      <div className="flex flex-col items-center justify-center py-24 min-h-100 bg-surface-1/50 dark:bg-surface-dark-1/50 rounded-3xl border border-border/30 border-dashed">
        <Loader2 className="w-12 h-12 animate-spin text-accent mb-4" />
        <span className="text-lg font-bold text-muted">Loading photos...</span>
        <span className="text-sm font-medium text-muted/70 mt-2">Page {pagination.page}</span>
      </div>
    ) : state.photoUrls.length > 0 ? (
      <div
        className="grid grid-cols-1 gap-5 pt-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 lg:gap-6"
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
        <h3 className="mt-5 text-xl font-bold text-text">Ничего не найдено</h3>
        <p className="mt-2 max-w-md text-sm font-medium text-muted">
          По запросу &quot;{state.activeSearchTerm}&quot; не найдено фотографий.
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
      <EmptyGalleryState onUploadClick={() => photoUploaderRef.current?.openFilePicker()} />
    )}

    {pagination.totalPages > 1 && (
      <div className="mt-8 border-t border-border/50 dark:border-border/30 pt-6">
        <PaginationControls pagination={pagination} isLoading={state.isLoadingPhotos} />
      </div>
    )}
  </div>
);

export const GalleryPhotoSection = React.memo(GalleryPhotoSectionComponent);
