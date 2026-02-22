import { useState, useCallback } from 'react';
import { galleryService, type Gallery } from '../services/galleryService';
import { useErrorHandler, useConfirmation, usePagination, useModal } from './index';

export const useDashboardActions = () => {
    const [galleries, setGalleries] = useState<Gallery[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);

    const pagination = usePagination({ pageSize: 9 });
    const createModal = useModal();
    const { error, clearError, handleError, isLoading, setLoading } = useErrorHandler();
    const { openConfirm, ConfirmModal } = useConfirmation();

    const fetchGalleries = useCallback(
        async (pageNum: number) => {
            setLoading(true);
            try {
                clearError();
                const response = await galleryService.getGalleries(pageNum, pagination.pageSize);
                setGalleries(response.galleries);
                pagination.setTotal(response.total);
            } catch (err: unknown) {
                handleError(err);
            } finally {
                setLoading(false);
            }
        },
        [clearError, handleError, setLoading, pagination],
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
            pagination.firstPage();
            await fetchGalleries(1);
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
                    await fetchGalleries(pagination.page);
                } catch (err) {
                    handleError(err);
                    throw err;
                }
            },
        });
    };

    const renameGallery = async (id: string, newName: string) => {
        try {
            setIsRenaming(true);
            await galleryService.updateGallery(id, newName.trim());
            await fetchGalleries(pagination.page);
        } catch (err: unknown) {
            handleError(err);
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
