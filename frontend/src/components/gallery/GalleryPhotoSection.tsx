import { CheckSquare, Loader2, Upload } from 'lucide-react';
import type { MutableRefObject, RefObject } from 'react';
import { PaginationControls } from '../PaginationControls';
import { EmptyGalleryState } from './EmptyGalleryState';
import { PhotoCard } from './PhotoCard';
import { PhotoSelectionBar } from './PhotoSelectionBar';
import { PhotoUploader, type PhotoUploaderHandle } from '../PhotoUploader';
import type { PhotoUploadResponse, PhotoResponse } from '../../services/photoService';

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
  photoUrls: PhotoResponse[];
  pagination: GalleryPagination;
  isLoadingPhotos: boolean;
  uploadError: string | null;
  error: string | null;
  isSelectionMode: boolean;
  isCoverPhoto: (photoId: string) => boolean;
  isPhotoSelected: (photoId: string) => boolean;
  areAllOnPageSelected: boolean;
  selectionCount: number;
  hasSelection: boolean;
  gridRef: MutableRefObject<HTMLDivElement | null>;
  photoUploaderRef: RefObject<PhotoUploaderHandle | null>;
  onUploadComplete: (result: PhotoUploadResponse) => void;
  onDismissUploadError: () => void;
  onDismissError: () => void;
  onToggleSelectionMode: () => void;
  onTogglePhotoSelection: (photoId: string, isShiftKey: boolean) => void;
  onOpenPhoto: (index: number) => void;
  onSetCover: (photoId: string) => void;
  onClearCover: () => void;
  onRenamePhoto: (photoId: string, filename: string) => void;
  onDeletePhoto: (photoId: string) => void;
  onSelectAllPhotos: () => void;
  onCancelSelection: () => void;
  onDeleteMultiplePhotos: () => void;
}

export const GalleryPhotoSection = ({
  galleryId,
  photoUrls,
  pagination,
  isLoadingPhotos,
  uploadError,
  error,
  isSelectionMode,
  isCoverPhoto,
  isPhotoSelected,
  areAllOnPageSelected,
  selectionCount,
  hasSelection,
  gridRef,
  photoUploaderRef,
  onUploadComplete,
  onDismissUploadError,
  onDismissError,
  onToggleSelectionMode,
  onTogglePhotoSelection,
  onOpenPhoto,
  onSetCover,
  onClearCover,
  onRenamePhoto,
  onDeletePhoto,
  onSelectAllPhotos,
  onCancelSelection,
  onDeleteMultiplePhotos,
}: GalleryPhotoSectionProps) => (
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
              onClick={onToggleSelectionMode}
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
        onUploadComplete={onUploadComplete}
        showDropzone={false}
      />
      {uploadError && (
        <div className="mt-2 text-danger bg-danger/10 dark:bg-danger/20 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
          {uploadError}
          <button
            onClick={onDismissUploadError}
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
            onClick={onDismissError}
            className="ml-2 text-xs text-accent-foreground bg-danger/80 hover:bg-danger px-2 py-1 rounded shadow-sm hover:shadow-md transition-all duration-200"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>

    {pagination.totalPages > 1 && (
      <div className="mb-8 border-b border-border dark:border-border/40">
        <PaginationControls pagination={pagination} isLoading={isLoadingPhotos} />
      </div>
    )}

    <PhotoSelectionBar
      isSelectionMode={isSelectionMode}
      hasSelection={hasSelection}
      selectionCount={selectionCount}
      areAllOnPageSelected={areAllOnPageSelected}
      onSelectAll={onSelectAllPhotos}
      onCancel={onCancelSelection}
      onDeleteMultiple={onDeleteMultiplePhotos}
    />

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
            isSelected={isPhotoSelected(photo.id)}
            isCover={isCoverPhoto(photo.id)}
            onToggleSelection={onTogglePhotoSelection}
            onOpenPhoto={onOpenPhoto}
            onSetCover={onSetCover}
            onClearCover={onClearCover}
            onRenamePhoto={onRenamePhoto}
            onDeletePhoto={onDeletePhoto}
          />
        ))}
      </div>
    ) : (
      <EmptyGalleryState onUploadClick={() => photoUploaderRef.current?.openFilePicker()} />
    )}

    {pagination.totalPages > 1 && (
      <div className="mt-8 border-t border-border dark:border-border/40">
        <PaginationControls pagination={pagination} isLoading={isLoadingPhotos} />
      </div>
    )}
  </div>
);
