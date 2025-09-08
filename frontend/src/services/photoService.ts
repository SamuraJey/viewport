import { api } from '../lib/api'

export interface Photo {
  id: string
  gallery_id: string
  url: string
  created_at: string
}

export interface PhotoUrlResponse {
  url: string
  expires_in: number
}

const uploadPhoto = async (galleryId: string, file: File): Promise<Photo> => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await api.post<Photo>(`/galleries/${galleryId}/photos`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}

const deletePhoto = async (galleryId: string, photoId: string): Promise<void> => {
  await api.delete(`/galleries/${galleryId}/photos/${photoId}`)
}

const getPhotoUrl = async (galleryId: string, photoId: string): Promise<PhotoUrlResponse> => {
  const response = await api.get<PhotoUrlResponse>(`/galleries/${galleryId}/photos/${photoId}/url`)
  return response.data
}

const getPhotoUrlDirect = async (photoId: string): Promise<PhotoUrlResponse> => {
  const response = await api.get<PhotoUrlResponse>(`/photos/auth/${photoId}/url`)
  return response.data
}

export const photoService = {
  uploadPhoto,
  deletePhoto,
  getPhotoUrl,
  getPhotoUrlDirect,
}
