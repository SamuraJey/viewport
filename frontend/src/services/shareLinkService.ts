import { api } from '../lib/api';
import { isDemoModeEnabled } from '../lib/demoMode';
import { getDemoService } from './demoService';
import type {
  ShareLink,
  ShareLinkAnalyticsResponse,
  ShareLinksDashboardResponse,
  ShareLinkUpdateRequest,
  PublicPhoto,
  SharedGallery,
  SharedGalleryQueryOptions,
} from '../types';

// Re-export types for backward compatibility
export type {
  ShareLink,
  ShareLinksDashboardResponse,
  ShareLinkAnalyticsResponse,
  ShareLinkUpdateRequest,
  PublicPhoto,
  SharedGallery,
};

const getShareLinks = async (galleryId: string): Promise<ShareLink[]> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getShareLinks(galleryId);
  }

  const response = await api.get<ShareLink[]>(`/galleries/${galleryId}/share-links`);
  return response.data;
};

const createShareLink = async (galleryId: string): Promise<ShareLink> => {
  if (isDemoModeEnabled()) {
    return getDemoService().createShareLink(galleryId);
  }

  const response = await api.post<ShareLink>(`/galleries/${galleryId}/share-links`, {
    expires_at: null,
  });
  return response.data;
};

const updateShareLink = async (
  galleryId: string,
  shareLinkId: string,
  payload: ShareLinkUpdateRequest,
): Promise<ShareLink> => {
  if (isDemoModeEnabled()) {
    return getDemoService().updateShareLink(galleryId, shareLinkId, payload);
  }

  const response = await api.patch<ShareLink>(
    `/galleries/${galleryId}/share-links/${shareLinkId}`,
    payload,
  );
  return response.data;
};

const deleteShareLink = async (galleryId: string, shareLinkId: string): Promise<void> => {
  if (isDemoModeEnabled()) {
    await getDemoService().deleteShareLink(galleryId, shareLinkId);
    return;
  }

  await api.delete(`/galleries/${galleryId}/share-links/${shareLinkId}`);
};

const getSharedGallery = async (
  shareId: string,
  options?: SharedGalleryQueryOptions,
): Promise<SharedGallery> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getSharedGallery(shareId, options);
  }

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

const getOwnerShareLinks = async (
  page = 1,
  size = 20,
  search?: string,
): Promise<ShareLinksDashboardResponse> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getOwnerShareLinks(page, size, search);
  }

  const params = new URLSearchParams({
    page: page.toString(),
    size: size.toString(),
  });
  if (search && search.trim().length > 0) {
    params.set('search', search.trim());
  }

  const response = await api.get<ShareLinksDashboardResponse>(`/share-links?${params.toString()}`);
  return response.data;
};

const getShareLinkAnalytics = async (
  shareLinkId: string,
  days = 30,
): Promise<ShareLinkAnalyticsResponse> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getShareLinkAnalytics(shareLinkId, days);
  }

  const response = await api.get<ShareLinkAnalyticsResponse>(
    `/share-links/${shareLinkId}/analytics?days=${days}`,
  );
  return response.data;
};

const getPublicPhotoUrl = async (
  shareId: string,
  photoId: string,
): Promise<{ url: string; expires_in: number }> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getPublicPhotoUrl(shareId, photoId);
  }

  const response = await api.get(`/s/${shareId}/photos/${photoId}/url`);
  return response.data;
};

const getAllPublicPhotoUrls = async (shareId: string): Promise<PublicPhoto[]> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getAllPublicPhotoUrls(shareId);
  }

  const response = await api.get(`/s/${shareId}/photos/urls`);
  return response.data;
};

export const shareLinkService = {
  getShareLinks,
  createShareLink,
  updateShareLink,
  deleteShareLink,
  getSharedGallery,
  getPublicPhotoUrl,
  getAllPublicPhotoUrls,
  getOwnerShareLinks,
  getShareLinkAnalytics,
};
