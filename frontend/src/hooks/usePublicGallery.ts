import { useState, useCallback, useEffect } from 'react';
import {
  shareLinkService,
  type PublicPhoto,
  type SharedGallery,
} from '../services/shareLinkService';

const PUBLIC_GALLERY_FATAL_STATUSES = new Set([404, 410]);

const getErrorStatus = (error: unknown): number | undefined => {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return typeof status === 'number' ? status : undefined;
};

interface UsePublicGalleryProps {
  shareId: string | undefined;
  galleryId?: string;
  photosPerPage?: number;
  skipProjectViewCount?: boolean;
}

export const usePublicGallery = ({
  shareId,
  galleryId,
  photosPerPage = 100,
  skipProjectViewCount = false,
}: UsePublicGalleryProps) => {
  const [gallery, setGallery] = useState<SharedGallery | null>(null);
  const [photos, setPhotos] = useState<PublicPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string>('');
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  const fetchGalleryData = useCallback(async () => {
    if (!shareId) {
      setError('Invalid share link');
      setErrorStatus(400);
      setHasMore(false);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      setErrorStatus(null);
      const data = await shareLinkService.getSharedGallery(shareId, {
        limit: photosPerPage,
        offset: 0,
        galleryId,
        skipProjectViewCount,
      });

      setGallery(data);
      const loadedPhotos = data.scope_type === 'project' ? [] : data.photos || [];
      setPhotos(loadedPhotos);
      setHasMore(loadedPhotos.length === photosPerPage);
    } catch (err) {
      console.error('Failed to fetch shared gallery:', err);
      const status = getErrorStatus(err);
      setErrorStatus(status ?? null);
      if (status && PUBLIC_GALLERY_FATAL_STATUSES.has(status)) {
        setHasMore(false);
      }
      setError(status === 410 ? 'Share link has expired' : 'Gallery not found');
    } finally {
      setIsLoading(false);
    }
  }, [galleryId, shareId, photosPerPage, skipProjectViewCount]);

  const loadMorePhotos = useCallback(async () => {
    if (isLoadingMore || !hasMore || !shareId) return;

    setIsLoadingMore(true);
    try {
      const currentOffset = photos.length;
      const moreData = await shareLinkService.getSharedGallery(shareId, {
        limit: photosPerPage,
        offset: currentOffset,
        galleryId,
        skipProjectViewCount,
      });

      const newPhotos = moreData.scope_type === 'project' ? [] : moreData.photos || [];
      setPhotos((prev) => [...prev, ...newPhotos]);
      setHasMore(newPhotos.length === photosPerPage);
    } catch (err) {
      console.error('Failed to load more photos:', err);
      const status = getErrorStatus(err);
      if (status && PUBLIC_GALLERY_FATAL_STATUSES.has(status)) {
        setErrorStatus(status);
        setHasMore(false);
        setError(status === 410 ? 'Share link has expired' : 'Gallery not found');
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    galleryId,
    shareId,
    photos.length,
    isLoadingMore,
    hasMore,
    photosPerPage,
    skipProjectViewCount,
  ]);

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
    errorStatus,
    loadMorePhotos,
  };
};
