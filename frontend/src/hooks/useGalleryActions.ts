import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { galleryService, type GalleryDetail } from '../services/galleryService';
import { photoService } from '../services/photoService';
import type { PhotoUploadResponse } from '../services/photoService';
import { shareLinkService, type ShareLink } from '../services/shareLinkService';
import { useErrorHandler, useConfirmation, useModal } from '../hooks';
import { handleApiError } from '../lib/errorHandling';
import type { GalleryPhotoSortBy, SortOrder } from '../types';

interface UseGalleryActionsProps {
  galleryId: string;
  filters: {
    search?: string;
    sort_by: GalleryPhotoSortBy;
    order: SortOrder;
  };
  pagination: {
    page: number;
    pageSize: number;
    setTotal: (total: number) => void;
  };
}

export const useGalleryActions = ({ galleryId, filters, pagination }: UseGalleryActionsProps) => {
  const navigate = useNavigate();
  const [gallery, setGallery] = useState<GalleryDetail | null>(null);
  const [photoUrls, setPhotoUrls] = useState<GalleryDetail['photos']>([]);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [isLoadingShareLinks, setIsLoadingShareLinks] = useState(false);
  const [shareLinksError, setShareLinksError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [actionInfo, setActionInfo] = useState('');
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [shootingDateInput, setShootingDateInput] = useState('');
  const [isSavingShootingDate, setIsSavingShootingDate] = useState(false);
  const [isSavingPublicSortSettings, setIsSavingPublicSortSettings] = useState(false);

  const { error, clearError, handleError } = useErrorHandler();
  const { openConfirm, ConfirmModal } = useConfirmation();
  const renameModal = useModal<{ id: string; filename: string }>();

  const { page, pageSize, setTotal } = pagination;

  const isNotFoundError = (error: unknown): boolean => handleApiError(error).statusCode === 404;

  const fetchShareLinks = useCallback(
    async (isInitial = true) => {
      if (isInitial) {
        setIsLoadingShareLinks(true);
      }
      setShareLinksError('');
      try {
        const links = await shareLinkService.getShareLinks(galleryId);
        setShareLinks(links);
      } catch (err) {
        setShareLinksError(handleApiError(err).message || 'Failed to load share links');
      } finally {
        if (isInitial) {
          setIsLoadingShareLinks(false);
        }
      }
    },
    [galleryId],
  );

  const removePhotoLocally = useCallback((photoId: string) => {
    setPhotoUrls((prev) => prev.filter((photo) => photo.id !== photoId));
    setGallery((prev: GalleryDetail | null) =>
      prev && prev.cover_photo_id === photoId ? { ...prev, cover_photo_id: null } : prev,
    );
  }, []);

  const fetchGalleryDetails = useCallback(
    async (page: number, isInitial = false) => {
      if (isInitial) {
        setIsInitialLoading(true);
      } else {
        setIsLoadingPhotos(true);
      }
      clearError();
      try {
        const offset = (page - 1) * pageSize;
        const galleryData = await galleryService.getGallery(galleryId, {
          limit: pageSize,
          offset,
          search: filters.search,
          sort_by: filters.sort_by,
          order: filters.order,
        });
        const shouldRefreshShareLinks = gallery?.id !== galleryData.id;
        setGallery(galleryData);
        setPhotoUrls(galleryData.photos || []);
        setTotal(galleryData.total_photos);
        const fallbackDate = galleryData.shooting_date || galleryData.created_at || '';
        setShootingDateInput(fallbackDate.slice(0, 10));
        if (shouldRefreshShareLinks) {
          void fetchShareLinks(false);
        }
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
    [
      gallery?.id,
      galleryId,
      pageSize,
      setTotal,
      clearError,
      handleError,
      fetchShareLinks,
      filters.search,
      filters.sort_by,
      filters.order,
    ],
  );

  const handleUploadComplete = async (result: PhotoUploadResponse) => {
    setUploadError('');

    if (result.successful_uploads > 0) {
      try {
        setActionInfo('');
        setIsLoadingPhotos(true);
        const offset = (page - 1) * pageSize;
        const galleryData = await galleryService.getGallery(galleryId, {
          limit: pageSize,
          offset,
          search: filters.search,
          sort_by: filters.sort_by,
          order: filters.order,
        });
        setPhotoUrls(galleryData.photos || []);
        setTotal(galleryData.total_photos);
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

  const handleSaveShootingDate = useCallback(
    async (dateValue?: string): Promise<boolean> => {
      const normalizedDate = (dateValue ?? shootingDateInput).trim();

      if (!normalizedDate) {
        const fallbackDate = gallery?.shooting_date?.slice(0, 10) ?? '';
        if (shootingDateInput !== fallbackDate) {
          setShootingDateInput(fallbackDate);
        }
        return false;
      }

      setIsSavingShootingDate(true);
      clearError();
      try {
        const updated = await galleryService.updateGallery(galleryId, {
          shooting_date: normalizedDate,
        });
        setGallery((prev: GalleryDetail | null) =>
          prev ? { ...prev, shooting_date: updated.shooting_date } : prev,
        );
        setShootingDateInput(updated.shooting_date?.slice(0, 10) ?? '');
        return true;
      } catch (err) {
        handleError(err);
        const fallbackDate = gallery?.shooting_date?.slice(0, 10) ?? '';
        if (shootingDateInput !== fallbackDate) {
          setShootingDateInput(fallbackDate);
        }
        return false;
      } finally {
        setIsSavingShootingDate(false);
      }
    },
    [clearError, gallery?.shooting_date, galleryId, handleError, shootingDateInput],
  );

  const handleSavePublicSortSettings = useCallback(
    async (publicSortBy: GalleryPhotoSortBy, publicSortOrder: SortOrder): Promise<boolean> => {
      setIsSavingPublicSortSettings(true);
      clearError();
      try {
        const updated = await galleryService.updateGallery(galleryId, {
          public_sort_by: publicSortBy,
          public_sort_order: publicSortOrder,
        });
        setGallery((prev: GalleryDetail | null) =>
          prev
            ? {
              ...prev,
              public_sort_by: updated.public_sort_by,
              public_sort_order: updated.public_sort_order,
            }
            : prev,
        );
        return true;
      } catch (err) {
        handleError(err);
        return false;
      } finally {
        setIsSavingPublicSortSettings(false);
      }
    },
    [clearError, galleryId, handleError],
  );

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
          navigate('/dashboard', { replace: true });
        } catch (err) {
          handleError(err);
          throw err;
        }
      },
    });
  };

  const releaseZipDownloadLock = useCallback(() => {
    window.setTimeout(() => {
      setIsDownloadingZip(false);
    }, 400);
  }, []);

  const handleDownloadGallery = async () => {
    setIsDownloadingZip(true);
    clearError();
    setActionInfo('');

    try {
      await photoService.downloadGalleryZip(galleryId);
    } catch (err) {
      handleError(err);
    } finally {
      releaseZipDownloadLock();
    }
  };

  const handleDownloadSelectedPhotos = async (selectedIds: Set<string>) => {
    if (selectedIds.size === 0) {
      return;
    }

    setIsDownloadingZip(true);
    clearError();
    setActionInfo('');

    try {
      await photoService.downloadSelectedPhotosZip(galleryId, Array.from(selectedIds));
    } catch (err) {
      handleError(err);
    } finally {
      releaseZipDownloadLock();
    }
  };

  const handleSetCover = async (photoId: string) => {
    try {
      await galleryService.setCoverPhoto(galleryId, photoId);
      setGallery((prev: GalleryDetail | null) =>
        prev ? { ...prev, cover_photo_id: photoId } : null,
      );
      setActionInfo('');
    } catch (err) {
      if (isNotFoundError(err)) {
        removePhotoLocally(photoId);
        setActionInfo('This photo was already deleted.');
        return;
      }
      handleError(err);
    }
  };

  const handleClearCover = async () => {
    try {
      await galleryService.clearCoverPhoto(galleryId);
      setGallery((prev: GalleryDetail | null) => (prev ? { ...prev, cover_photo_id: null } : null));
    } catch (err) {
      handleError(err);
    }
  };

  const handleCreateShareLink = async () => {
    setIsCreatingLink(true);
    clearError();
    try {
      await shareLinkService.createShareLink(galleryId);
      await fetchShareLinks(false);
    } catch (err) {
      handleError(err);
    } finally {
      setIsCreatingLink(false);
    }
  };
  // TODO May be add check of response status code. But later.
  const handleDeleteShareLink = (linkId: string) => {
    openConfirm({
      title: 'Delete Share Link',
      message: 'Are you sure you want to delete this share link?',
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await shareLinkService.deleteShareLink(galleryId, linkId);
          await fetchShareLinks(false);
        } catch (err) {
          handleError(err);
          throw err;
        }
      },
    });
  };

  const handleRenamePhoto = (photoId: string, currentFilename: string) => {
    renameModal.open({ id: photoId, filename: currentFilename });
  };

  const handleRenameConfirm = async (newFilename: string) => {
    if (!renameModal.data) return;

    const renamedPhoto = await photoService.renamePhoto(
      galleryId,
      renameModal.data.id,
      newFilename,
    );
    setPhotoUrls((prev) =>
      prev.map((photo) =>
        photo.id === renameModal.data!.id
          ? {
            ...photo,
            filename: renamedPhoto.filename,
            url: renamedPhoto.url,
            thumbnail_url: renamedPhoto.thumbnail_url,
          }
          : photo,
      ),
    );
  };

  const handleDeletePhoto = (photoId: string) => {
    openConfirm({
      title: 'Delete Photo',
      message: 'Are you sure you want to delete this photo? This action cannot be undone.',
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await photoService.deletePhoto(galleryId, photoId);
          removePhotoLocally(photoId);
          setActionInfo('');
        } catch (err) {
          if (isNotFoundError(err)) {
            removePhotoLocally(photoId);
            setActionInfo('This photo was already deleted.');
            return;
          }
          handleError(err);
          throw err;
        }
      },
    });
  };

  const handleDeleteMultiplePhotos = (selectedIds: Set<string>, clearSelection: () => void) => {
    openConfirm({
      title: 'Delete Photos',
      message: `Are you sure you want to delete ${selectedIds.size} photo${selectedIds.size > 1 ? 's' : ''}? This action cannot be undone.`,
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        const selectedPhotoIds = Array.from(selectedIds);
        let result: Awaited<ReturnType<typeof photoService.deletePhotos>>;
        try {
          result = await photoService.deletePhotos(galleryId, selectedPhotoIds);
        } catch (err) {
          handleError(err);
          throw err;
        }

        const deletedOrMissingIds = [...result.deleted_ids, ...result.not_found_ids];
        const notFoundCount = result.not_found_ids.length;

        if (deletedOrMissingIds.length > 0) {
          const deletedOrMissingSet = new Set(deletedOrMissingIds);
          setPhotoUrls((prev) => prev.filter((photo) => !deletedOrMissingSet.has(photo.id)));
          setGallery((prev: GalleryDetail | null) =>
            prev && prev.cover_photo_id && deletedOrMissingSet.has(prev.cover_photo_id)
              ? { ...prev, cover_photo_id: null }
              : prev,
          );
        }

        if (result.failed_ids.length > 0) {
          const enqueueError = new Error(
            `Failed to enqueue deletion for ${result.failed_ids.length} photo${result.failed_ids.length > 1 ? 's' : ''}.`,
          );
          handleError(enqueueError);
          throw enqueueError;
        }

        if (deletedOrMissingIds.length > 0) {
          if (notFoundCount > 0) {
            setActionInfo(
              notFoundCount === 1
                ? '1 photo was already deleted.'
                : `${notFoundCount} photos were already deleted.`,
            );
          } else {
            setActionInfo('');
          }
          clearSelection();
        }
      },
    });
  };

  return {
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
    handleDeleteMultiplePhotos,
  };
};
