import { api } from '../lib/api';
import { isDemoModeEnabled } from '../lib/demoMode';
import { demoService } from './demoService';
import type { Gallery, GalleryDetail, GalleryListResponse } from '../types';

// Re-export types for backward compatibility
export type { Gallery, GalleryDetail, GalleryListResponse };

const getGalleries = async (page = 1, size = 10): Promise<GalleryListResponse> => {
  if (isDemoModeEnabled()) {
    return demoService.getGalleries(page, size);
  }

  const response = await api.get(`/galleries?page=${page}&size=${size}`);
  return response.data;
};

const getGallery = async (
  id: string,
  options?: { limit?: number; offset?: number },
): Promise<GalleryDetail> => {
  if (isDemoModeEnabled()) {
    return demoService.getGallery(id, options);
  }

  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.offset) params.append('offset', options.offset.toString());

  const url = `/galleries/${id}${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await api.get<GalleryDetail>(url);
  return response.data;
};

type CreateGalleryPayload = string | { name?: string; shooting_date?: string | null };

const createGallery = async (payload: CreateGalleryPayload): Promise<Gallery> => {
  const body = typeof payload === 'string' ? { name: payload } : payload;

  if (isDemoModeEnabled()) {
    return demoService.createGallery(body ?? {});
  }

  const response = await api.post<Gallery>('/galleries', body ?? {});
  return response.data;
};

const deleteGallery = async (id: string): Promise<void> => {
  if (isDemoModeEnabled()) {
    await demoService.deleteGallery(id);
    return;
  }

  await api.delete(`/galleries/${id}`);
};

type UpdateGalleryPayload = string | { name?: string; shooting_date?: string | null };

const updateGallery = async (id: string, payload: UpdateGalleryPayload): Promise<Gallery> => {
  const body = typeof payload === 'string' ? { name: payload } : payload;

  if (isDemoModeEnabled()) {
    return demoService.updateGallery(id, body ?? {});
  }

  const response = await api.patch<Gallery>(`/galleries/${id}`, body ?? {});
  return response.data;
};

const setCoverPhoto = async (galleryId: string, photoId: string): Promise<Gallery> => {
  if (isDemoModeEnabled()) {
    return demoService.setCoverPhoto(galleryId, photoId);
  }

  const response = await api.post<Gallery>(`/galleries/${galleryId}/cover/${photoId}`);
  return response.data;
};

const clearCoverPhoto = async (galleryId: string): Promise<void> => {
  if (isDemoModeEnabled()) {
    await demoService.clearCoverPhoto(galleryId);
    return;
  }

  await api.delete(`/galleries/${galleryId}/cover`);
};

export const galleryService = {
  getGalleries,
  getGallery,
  createGallery,
  deleteGallery,
  updateGallery,
  setCoverPhoto,
  clearCoverPhoto,
};
