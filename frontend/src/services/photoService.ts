import { api } from '../lib/api'

export interface Photo {
  id: string
  gallery_id: string
  url: string
  created_at: string
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

const deletePhoto = async (photoId: string): Promise<void> => {
  await api.delete(`/photos/${photoId}`)
}

export const photoService = {
  uploadPhoto,
  deletePhoto,
}
