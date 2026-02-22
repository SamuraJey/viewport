import { useState, useCallback } from 'react';
import { galleryService, type GalleryDetail } from '../services/galleryService';
import { photoService, type PhotoResponse } from '../services/photoService';
import type { PhotoUploadResponse } from '../services/photoService';
import { shareLinkService, type ShareLink } from '../services/shareLinkService';
import { useErrorHandler, useConfirmation, useModal } from '../hooks';

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
  const [photoUrls, setPhotoUrls] = useState<PhotoResponse[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [shootingDateInput, setShootingDateInput] = useState('');
  const [isSavingShootingDate, setIsSavingShootingDate] = useState(false);

  const { error, clearError, handleError } = useErrorHandler();
  const { openConfirm, ConfirmModal } = useConfirmation();
  const renameModal = useModal<{ id: string; filename: string }>();

  const { page, pageSize, setTotal } = pagination;

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
        setGallery(galleryData);
        setPhotoUrls(galleryData.photos || []);
        setShareLinks(galleryData.share_links || []);
        setTotal(galleryData.total_photos);
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
    [galleryId, pageSize, setTotal, clearError, handleError],
  );

  const handleUploadComplete = async (result: PhotoUploadResponse) => {
    setUploadError('');

    if (result.successful_uploads > 0) {
      try {
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
    } catch (err) {
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
      const galleryData = await galleryService.getGallery(galleryId, { limit: 1, offset: 0 });
      setShareLinks(galleryData.share_links || []);
    } catch (err) {
      handleError(err);
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleDeleteShareLink = (linkId: string) => {
    openConfirm({
      title: 'Delete Share Link',
      message: 'Are you sure you want to delete this share link?',
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await shareLinkService.deleteShareLink(galleryId, linkId);
          const galleryData = await galleryService.getGallery(galleryId, { limit: 1, offset: 0 });
          setShareLinks(galleryData.share_links || []);
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

    await photoService.renamePhoto(galleryId, renameModal.data.id, newFilename);
    setPhotoUrls((prev) =>
      prev.map((photo) =>
        photo.id === renameModal.data!.id ? { ...photo, filename: newFilename } : photo,
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
          setPhotoUrls((prev) => prev.filter((photo) => photo.id !== photoId));
        } catch (err) {
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
        try {
          await Promise.all(
            Array.from(selectedIds).map((photoId) => photoService.deletePhoto(galleryId, photoId)),
          );
          setPhotoUrls((prev) => prev.filter((photo) => !selectedIds.has(photo.id)));
          clearSelection();
        } catch (err) {
          handleError(err);
          throw err;
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
  };
};
