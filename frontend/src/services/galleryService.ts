import { api } from '../lib/api';
import type { Gallery, GalleryDetail, GalleryListResponse } from '../types';

// Re-export types for backward compatibility
export type { Gallery, GalleryDetail, GalleryListResponse };

const getGalleries = async (page = 1, size = 10): Promise<GalleryListResponse> => {
  const response = await api.get(`/galleries?page=${page}&size=${size}`);
  return response.data;
};

const getGallery = async (
  id: string,
  options?: { limit?: number; offset?: number },
): Promise<GalleryDetail> => {
  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.offset) params.append('offset', options.offset.toString());

  const url = `/galleries/${id}${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await api.get<GalleryDetail>(url);
  return response.data;
};

const createGallery = async (name: string): Promise<Gallery> => {
  const response = await api.post<Gallery>('/galleries', { name });
  return response.data;
};

const deleteGallery = async (id: string): Promise<void> => {
  await api.delete(`/galleries/${id}`);
};

const updateGallery = async (id: string, name: string): Promise<Gallery> => {
  const response = await api.patch<Gallery>(`/galleries/${id}`, { name });
  return response.data;
};

const setCoverPhoto = async (galleryId: string, photoId: string): Promise<Gallery> => {
  const response = await api.post<Gallery>(`/galleries/${galleryId}/cover/${photoId}`);
  return response.data;
};

const clearCoverPhoto = async (galleryId: string): Promise<void> => {
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
