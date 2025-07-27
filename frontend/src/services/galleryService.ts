import { api } from '../lib/api'
import type { Photo } from './photoService'
import type { ShareLink } from './shareLinkService'

export interface Gallery {
  id: string
  owner_id: string
  created_at: string
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

const createGallery = async (): Promise<Gallery> => {
  const response = await api.post<Gallery>('/galleries', {})
  return response.data
}

const deleteGallery = async (id: string): Promise<void> => {
  await api.delete(`/galleries/${id}`)
}

export const galleryService = {
  getGalleries,
  getGallery,
  createGallery,
  deleteGallery,
}
