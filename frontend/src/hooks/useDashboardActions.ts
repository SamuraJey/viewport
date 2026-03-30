import { useState, useCallback } from 'react';
import { galleryService, type Gallery } from '../services/galleryService';
import { useErrorHandler, useConfirmation, usePagination, useModal } from './index';

const API_GALLERY_PAGE_SIZE = 100;

export const useDashboardActions = () => {
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);

  const pagination = usePagination({ pageSize: 10 });
  const createModal = useModal();
  const { error, clearError, handleError, isLoading, setLoading } = useErrorHandler();
  const { openConfirm, ConfirmModal } = useConfirmation();

  const { setTotal } = pagination;

  const fetchGalleries = useCallback(async () => {
    setLoading(true);
    try {
      clearError();
      const allGalleries: Gallery[] = [];
      let pageNum = 1;
      let total = 0;

      while (true) {
        const response = await galleryService.getGalleries(pageNum, API_GALLERY_PAGE_SIZE);
        if (pageNum === 1) {
          total = response.total;
        }

        allGalleries.push(...response.galleries);
        if (allGalleries.length >= total || response.galleries.length === 0) {
          break;
        }
        pageNum += 1;
      }

      setGalleries(allGalleries);
      setTotal(allGalleries.length);
    } catch (err: unknown) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }, [clearError, handleError, setLoading, setTotal]);

  const createGallery = async (name: string, shootingDate: string) => {
    if (!name.trim()) return;

    try {
      setIsCreating(true);
      await galleryService.createGallery({
        name: name.trim(),
        shooting_date: shootingDate || undefined,
      });
      createModal.close();
      pagination.firstPage();
      await fetchGalleries();
    } catch (err: unknown) {
      handleError(err);
    } finally {
      setIsCreating(false);
    }
  };

  const deleteGallery = async (gallery: Gallery) => {
    openConfirm({
      title: 'Delete Gallery?',
      message: `Are you sure you want to delete "${gallery.name || `Gallery #${gallery.id}`}" and all its contents? This action cannot be undone.`,
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await galleryService.deleteGallery(gallery.id);
          await fetchGalleries();
        } catch (err) {
          handleError(err);
          throw err;
        }
      },
    });
  };

  const renameGallery = async (id: string, newName: string): Promise<boolean> => {
    const normalizedName = newName.trim();
    const currentGallery = galleries.find((gallery) => gallery.id === id);
    const currentName = currentGallery?.name?.trim() ?? '';

    if (!normalizedName || normalizedName === currentName) {
      return false;
    }

    try {
      setIsRenaming(true);
      const updatedGallery = await galleryService.updateGallery(id, normalizedName);
      setGalleries((currentGalleries) =>
        currentGalleries.map((gallery) => (gallery.id === id ? updatedGallery : gallery)),
      );
      return true;
    } catch (err: unknown) {
      handleError(err);
      return false;
    } finally {
      setIsRenaming(false);
    }
  };

  return {
    galleries,
    isCreating,
    isRenaming,
    pagination,
    createModal,
    error,
    clearError,
    isLoading,
    ConfirmModal,
    fetchGalleries,
    createGallery,
    deleteGallery,
    renameGallery,
  };
};
