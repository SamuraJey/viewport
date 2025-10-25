import { api } from '../lib/api'

export interface PhotoResponse {
  id: string
  gallery_id: string
  url: string
  thumbnail_url: string
  filename: string
  width?: number | null
  height?: number | null
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

const renamePhoto = async (galleryId: string, photoId: string, filename: string): Promise<PhotoResponse> => {
  const response = await api.patch<PhotoResponse>(`/galleries/${galleryId}/photos/${photoId}/rename`, {
    filename
  })
  return response.data
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
  const BATCH_SIZE = 50
  const totalFiles = files.length
  let totalLoaded = 0
  const totalSize = files.reduce((sum, file) => sum + file.size, 0)

  const allResults: PhotoUploadResult[] = []
  let successfulUploads = 0
  let failedUploads = 0

  // Split files into batches of 50
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE)
    const batchSize = batch.reduce((sum, file) => sum + file.size, 0)

    const formData = new FormData()
    batch.forEach(file => {
      formData.append('files', file)
    })

    try {
      const response = await api.post<PhotoUploadResponse>(
        `/galleries/${galleryId}/photos/batch`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            if (onProgress && progressEvent.total) {
              // Calculate progress for current batch within overall progress
              const batchLoaded = progressEvent.loaded
              const currentTotalLoaded = totalLoaded + batchLoaded
              const percentage = Math.round((currentTotalLoaded * 100) / totalSize)

              onProgress({
                loaded: currentTotalLoaded,
                total: totalSize,
                percentage,
                currentFile: `Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(totalFiles / BATCH_SIZE)}: ${batch[0]?.name || 'Uploading...'}`
              })
            }
          }
        }
      )

      // Add batch size to total loaded after successful upload
      totalLoaded += batchSize

      // Accumulate results
      allResults.push(...response.data.results)
      successfulUploads += response.data.successful_uploads
      failedUploads += response.data.failed_uploads

    } catch (error) {
      // If batch fails, mark all files in batch as failed
      const failedResults: PhotoUploadResult[] = batch.map(file => ({
        filename: file.name,
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      }))

      allResults.push(...failedResults)
      failedUploads += batch.length
      totalLoaded += batchSize
    }
  }

  return {
    results: allResults,
    total_files: totalFiles,
    successful_uploads: successfulUploads,
    failed_uploads: failedUploads
  }
}

const getAllPhotoUrls = async (galleryId: string): Promise<PhotoResponse[]> => {
  const response = await api.get<PhotoResponse[]>(`/galleries/${galleryId}/photos/urls`)
  return response.data
}

export const photoService = {
  uploadPhoto,
  uploadPhotos,
  deletePhoto,
  renamePhoto,
  getPhotoUrl,
  getPhotoUrlDirect,
  getAllPhotoUrls,
};
