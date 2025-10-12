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
  onProgress?: (progress: { loaded: number; total: number; percentage: number; currentFile: string; currentBatch: number; totalBatches: number }) => void
): Promise<PhotoUploadResponse> => {
  const BATCH_SIZE = 100
  const totalFiles = files.length
  const totalBatches = Math.ceil(totalFiles / BATCH_SIZE)

  let allResults: PhotoUploadResult[] = []
  let totalSuccessful = 0
  let totalFailed = 0

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const startIndex = batchIndex * BATCH_SIZE
    const endIndex = Math.min(startIndex + BATCH_SIZE, totalFiles)
    const batchFiles = files.slice(startIndex, endIndex)

    const formData = new FormData()
    batchFiles.forEach(file => {
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
              // Calculate overall progress across all batches
              const batchProgress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
              const overallProgress = Math.round(((batchIndex * 100) + batchProgress) / totalBatches)

              onProgress({
                loaded: progressEvent.loaded + (batchIndex * progressEvent.total),
                total: totalFiles * (progressEvent.total / batchFiles.length), // Approximate total
                percentage: overallProgress,
                currentFile: batchFiles[0]?.name || 'Uploading...',
                currentBatch: batchIndex + 1,
                totalBatches
              })
            }
          }
        }
      )

      // Accumulate results from this batch
      allResults = allResults.concat(response.data.results)
      totalSuccessful += response.data.successful_uploads
      totalFailed += response.data.failed_uploads

    } catch (error) {
      console.error(`Batch ${batchIndex + 1} failed:`, error)

      // Add failed results for this batch
      const failedResults = batchFiles.map(file => ({
        filename: file.name,
        success: false,
        error: 'Batch upload failed'
      }))

      allResults = allResults.concat(failedResults)
      totalFailed += batchFiles.length
    }
  }

  return {
    results: allResults,
    total_files: totalFiles,
    successful_uploads: totalSuccessful,
    failed_uploads: totalFailed
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
