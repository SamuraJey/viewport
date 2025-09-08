import { api } from '../lib/api'

export interface ShareLink {
  id: string
  gallery_id: string
  expires_at: string | null
  views: number
  zip_downloads: number
  single_downloads: number
  created_at: string
}

const getShareLinks = async (galleryId: string): Promise<ShareLink[]> => {
  const response = await api.get<ShareLink[]>(`/galleries/${galleryId}/share-links`)
  return response.data
}

const createShareLink = async (galleryId: string): Promise<ShareLink> => {
  const response = await api.post<ShareLink>(`/galleries/${galleryId}/share-links`, {
    gallery_id: galleryId,
    expires_at: null
  })
  return response.data
}

const deleteShareLink = async (galleryId: string, shareLinkId: string): Promise<void> => {
  await api.delete(`/galleries/${galleryId}/share-links/${shareLinkId}`)
}

const getSharedGallery = async (shareId: string): Promise<any> => {
  const response = await api.get(`/s/${shareId}`)
  return response.data
}

const getPublicPhotoUrl = async (shareId: string, photoId: string): Promise<{ url: string, expires_in: number }> => {
  const response = await api.get(`/s/${shareId}/photos/${photoId}/url`)
  return response.data
}

export const shareLinkService = {
  getShareLinks,
  createShareLink,
  deleteShareLink,
  getSharedGallery,
  getPublicPhotoUrl,
}
