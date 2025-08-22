import { api } from '../lib/api'
import type { Photo } from './photoService'
import type { ShareLink } from './shareLinkService'

export interface Gallery {
  id: string
  owner_id: string
  name: string
  created_at: string
  cover_photo_id?: string | null
}

export interface GalleryDetail extends Gallery {
  photos: Photo[]
  share_links: ShareLink[]
}

export interface GalleryListResponse {
  galleries: Gallery[]
  total: number
  page: number
  size: number
}

const getGalleries = async (page = 1, size = 10): Promise<GalleryListResponse> => {
  const response = await api.get(`/galleries?page=${page}&size=${size}`)
  return response.data
}

const getGallery = async (id: string): Promise<GalleryDetail> => {
  const response = await api.get<GalleryDetail>(`/galleries/${id}`)
  return response.data
}

const createGallery = async (name: string): Promise<Gallery> => {
  const response = await api.post<Gallery>('/galleries', { name })
  return response.data
}

const deleteGallery = async (id: string): Promise<void> => {
  await api.delete(`/galleries/${id}`)
}

const updateGallery = async (id: string, name: string): Promise<Gallery> => {
  const response = await api.patch<Gallery>(`/galleries/${id}`, { name })
  return response.data
}

const setCoverPhoto = async (galleryId: string, photoId: string): Promise<Gallery> => {
  const response = await api.post<Gallery>(`/galleries/${galleryId}/cover/${photoId}`)
  return response.data
}

const clearCoverPhoto = async (galleryId: string): Promise<void> => {
  await api.delete(`/galleries/${galleryId}/cover`)
}

export const galleryService = {
  getGalleries,
  getGallery,
  createGallery,
  deleteGallery,
  updateGallery,
  setCoverPhoto,
  clearCoverPhoto,
}
