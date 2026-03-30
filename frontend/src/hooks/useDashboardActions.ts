import { useState, useCallback, useRef } from 'react';
import { galleryService, type Gallery } from '../services/galleryService';
import type { GalleryListQueryOptions } from '../types';
import { useErrorHandler, useConfirmation, usePagination, useModal } from './index';

type DashboardGalleriesQuery = GalleryListQueryOptions & {
  page: number;
  size: number;
};

export const useDashboardActions = () => {
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);

  const pagination = usePagination({ pageSize: 10, syncWithUrl: true });
  const createModal = useModal();
  const { error, clearError, handleError, isLoading, setLoading } = useErrorHandler();
  const { openConfirm, ConfirmModal } = useConfirmation();
  const lastQueryRef = useRef<DashboardGalleriesQuery | null>(null);

  const { setTotal } = pagination;

  const fetchGalleries = useCallback(
    async (query?: DashboardGalleriesQuery) => {
      const effectiveQuery = query ??
        lastQueryRef.current ?? {
          page: pagination.page,
          size: pagination.pageSize,
        };

      lastQueryRef.current = effectiveQuery;
      setLoading(true);
      try {
        clearError();
        const response = await galleryService.getGalleries(
          effectiveQuery.page,
          effectiveQuery.size,
          {
            search: effectiveQuery.search,
            sort_by: effectiveQuery.sort_by,
            order: effectiveQuery.order,
          },
        );

        setGalleries(response.galleries);
        setTotal(response.total);
      } catch (err: unknown) {
        handleError(err);
      } finally {
        setLoading(false);
      }
    },
    [clearError, handleError, pagination.page, pagination.pageSize, setLoading, setTotal],
  );

  const createGallery = async (name: string, shootingDate: string) => {
    if (!name.trim()) return;

    try {
      setIsCreating(true);
      await galleryService.createGallery({
        name: name.trim(),
        shooting_date: shootingDate || undefined,
      });
      createModal.close();

      const refreshedQuery: DashboardGalleriesQuery = {
        ...(lastQueryRef.current ?? {
          page: pagination.page,
          size: pagination.pageSize,
        }),
        page: 1,
      };

      if (pagination.page !== 1) {
        lastQueryRef.current = refreshedQuery;
        pagination.firstPage();
      } else {
        await fetchGalleries(refreshedQuery);
      }
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
