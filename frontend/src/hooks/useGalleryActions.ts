import { useState, useCallback } from 'react';
import { galleryService, type GalleryDetail } from '../services/galleryService';
import { photoService } from '../services/photoService';
import type { PhotoUploadResponse } from '../services/photoService';
import { shareLinkService, type ShareLink } from '../services/shareLinkService';
import { useErrorHandler, useConfirmation, useModal } from '../hooks';
import { handleApiError } from '../lib/errorHandling';

interface UseGalleryActionsProps {
  galleryId: string;
  pagination: {
    page: number;
    pageSize: number;
    setTotal: (total: number) => void;
  };
}

export const useGalleryActions = ({ galleryId, pagination }: UseGalleryActionsProps) => {
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
  const [shootingDateInput, setShootingDateInput] = useState('');
  const [isSavingShootingDate, setIsSavingShootingDate] = useState(false);

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
    [gallery?.id, galleryId, pageSize, setTotal, clearError, handleError, fetchShareLinks],
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

  const handleSaveShootingDate = async () => {
    if (!shootingDateInput) return;

    setIsSavingShootingDate(true);
    clearError();
    try {
      const updated = await galleryService.updateGallery(galleryId, {
        shooting_date: shootingDateInput,
      });
      setGallery((prev: GalleryDetail | null) =>
        prev ? { ...prev, shooting_date: updated.shooting_date } : prev,
      );
      setShootingDateInput(updated.shooting_date?.slice(0, 10) ?? shootingDateInput);
    } catch (err) {
      handleError(err);
    } finally {
      setIsSavingShootingDate(false);
    }
  };

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
        const deletedOrMissingIds: string[] = [];
        let notFoundCount = 0;
        let firstUnexpectedError: unknown = null;

        await Promise.all(
          Array.from(selectedIds).map(async (photoId) => {
            try {
              await photoService.deletePhoto(galleryId, photoId);
              deletedOrMissingIds.push(photoId);
            } catch (err) {
              if (isNotFoundError(err)) {
                deletedOrMissingIds.push(photoId);
                notFoundCount += 1;
                return;
              }

              if (!firstUnexpectedError) {
                firstUnexpectedError = err;
              }
            }
          }),
        );

        if (deletedOrMissingIds.length > 0) {
          const deletedOrMissingSet = new Set(deletedOrMissingIds);
          setPhotoUrls((prev) => prev.filter((photo) => !deletedOrMissingSet.has(photo.id)));
          setGallery((prev: GalleryDetail | null) =>
            prev && prev.cover_photo_id && deletedOrMissingSet.has(prev.cover_photo_id)
              ? { ...prev, cover_photo_id: null }
              : prev,
          );
        }

        if (firstUnexpectedError) {
          handleError(firstUnexpectedError);
          throw firstUnexpectedError;
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
