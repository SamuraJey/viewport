import { api } from '../lib/api'

export interface PhotoResponse {
  id: string
  gallery_id: string
  url: string
  file_size: number
  uploaded_at: string
}

export interface PhotoUrlResponse {
  id: string
  url: string
  expires_in: number
}

export interface PhotoUploadResult {
  filename: string
  success: boolean
  error?: string
  photo?: PhotoResponse
}

export interface PhotoUploadResponse {
  results: PhotoUploadResult[]
  total_files: number
  successful_uploads: number
  failed_uploads: number
}

const uploadPhoto = async (galleryId: string, file: File): Promise<PhotoResponse> => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await api.post<PhotoResponse>(`/galleries/${galleryId}/photos`, formData, {
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

const uploadPhotos = async (
  galleryId: string,
  files: File[],
  onProgress?: (progress: { loaded: number; total: number; percentage: number; currentFile: string }) => void
): Promise<PhotoUploadResponse> => {
  const formData = new FormData()
  files.forEach(file => {
    formData.append('files', file)
  })

  const response = await api.post<PhotoUploadResponse>(
    `/galleries/${galleryId}/photos/batch`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentage = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress({
            loaded: progressEvent.loaded,
            total: progressEvent.total,
            percentage,
            currentFile: files[0]?.name || 'Uploading...'
          })
        }
      }
    }
  )
  return response.data
}

const getAllPhotoUrls = async (galleryId: string): Promise<PhotoResponse[]> => {
  const response = await api.get<PhotoResponse[]>(`/galleries/${galleryId}/photos/urls`)
  return response.data
}

export const photoService = {
  uploadPhoto,
  uploadPhotos,
  deletePhoto,
  getPhotoUrl,
  getPhotoUrlDirect,
  getAllPhotoUrls,
};
