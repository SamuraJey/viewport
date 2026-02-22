import { useState, useCallback, useEffect } from 'react';
import {
    shareLinkService,
    type PublicPhoto,
    type SharedGallery,
} from '../services/shareLinkService';

interface UsePublicGalleryProps {
    shareId: string | undefined;
    photosPerPage?: number;
}

export const usePublicGallery = ({ shareId, photosPerPage = 100 }: UsePublicGalleryProps) => {
    const [gallery, setGallery] = useState<SharedGallery | null>(null);
    const [photos, setPhotos] = useState<PublicPhoto[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string>('');

    const fetchGalleryData = useCallback(async () => {
        if (!shareId) {
            setError('Invalid share link');
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            const data = await shareLinkService.getSharedGallery(shareId, {
                limit: photosPerPage,
                offset: 0,
            });

            setGallery(data);
            setPhotos(data.photos || []);
            setHasMore(data.photos.length === photosPerPage);
        } catch (err) {
            console.error('Failed to fetch shared gallery:', err);
            setError('Gallery not found or link has expired');
        } finally {
            setIsLoading(false);
        }
    }, [shareId, photosPerPage]);

    const loadMorePhotos = useCallback(async () => {
        if (isLoadingMore || !hasMore || !shareId) return;

        setIsLoadingMore(true);
        try {
            const currentOffset = photos.length;
            const moreData = await shareLinkService.getSharedGallery(shareId, {
                limit: photosPerPage,
                offset: currentOffset,
            });

            const newPhotos = moreData.photos || [];
            setPhotos((prev) => [...prev, ...newPhotos]);
            setHasMore(newPhotos.length === photosPerPage);
        } catch (err) {
            console.error('Failed to load more photos:', err);
        } finally {
            setIsLoadingMore(false);
        }
    }, [shareId, photos.length, isLoadingMore, hasMore, photosPerPage]);

    useEffect(() => {
        fetchGalleryData();
    }, [fetchGalleryData]);

    return {
        gallery,
        photos,
        isLoading,
        isLoadingMore,
        hasMore,
        error,
        loadMorePhotos,
    };
};
