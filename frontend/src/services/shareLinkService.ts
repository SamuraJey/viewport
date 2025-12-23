import { api } from '../lib/api';
import type { ShareLink, PublicPhoto, SharedGallery } from '../types';

// Re-export types for backward compatibility
export type { ShareLink, PublicPhoto, SharedGallery };

const getShareLinks = async (galleryId: string): Promise<ShareLink[]> => {
  const response = await api.get<ShareLink[]>(`/galleries/${galleryId}/share-links`);
  return response.data;
};

const createShareLink = async (galleryId: string): Promise<ShareLink> => {
  const response = await api.post<ShareLink>(`/galleries/${galleryId}/share-links`, {
    gallery_id: galleryId,
    expires_at: null,
  });
  return response.data;
};

const deleteShareLink = async (galleryId: string, shareLinkId: string): Promise<void> => {
  await api.delete(`/galleries/${galleryId}/share-links/${shareLinkId}`);
};

const getSharedGallery = async (
  shareId: string,
  options?: { limit?: number; offset?: number },
): Promise<SharedGallery> => {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.append('limit', options.limit.toString());
  }
  if (options?.offset !== undefined) {
    params.append('offset', options.offset.toString());
  }

  const queryString = params.toString();
  const url = queryString ? `/s/${shareId}?${queryString}` : `/s/${shareId}`;

  const response = await api.get(url);
  return response.data;
};

const getPublicPhotoUrl = async (
  shareId: string,
  photoId: string,
): Promise<{ url: string; expires_in: number }> => {
  const response = await api.get(`/s/${shareId}/photos/${photoId}/url`);
  return response.data;
};

const getAllPublicPhotoUrls = async (shareId: string): Promise<PublicPhoto[]> => {
  const response = await api.get(`/s/${shareId}/photos/urls`);
  return response.data;
};

export const shareLinkService = {
  getShareLinks,
  createShareLink,
  deleteShareLink,
  getSharedGallery,
  getPublicPhotoUrl,
  getAllPublicPhotoUrls,
};
