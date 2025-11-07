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
  onProgress?: (progress: {
    loaded: number
    total: number
    percentage: number
    currentFile: string
    currentBatch?: number
    totalBatches?: number
  }) => void
): Promise<PhotoUploadResponse> => {
  const BATCH_SIZE = 30
  const MAX_CONCURRENCY = 2

  if (files.length === 0) {
    return {
      results: [],
      total_files: 0,
      successful_uploads: 0,
      failed_uploads: 0,
    }
  }

  const batches: { index: number; files: File[] }[] = []
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    batches.push({ index: batches.length, files: files.slice(i, i + BATCH_SIZE) })
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  const totalBatches = batches.length

  const allResults: PhotoUploadResult[] = []
  let successfulUploads = 0
  let failedUploads = 0

  let completedBytes = 0
  const inFlightBytes = new Map<number, number>()
  const batchSizes = new Map<number, number>()

  const emitProgress = (currentBatchIndex: number, currentFileName: string) => {
    if (!onProgress) {
      return
    }

    const inFlightTotal = Array.from(inFlightBytes.values()).reduce((sum, value) => sum + value, 0)
    const loaded = completedBytes + inFlightTotal
    const percentage = totalSize > 0 ? Math.min(100, Math.round((loaded * 100) / totalSize)) : 0

    onProgress({
      loaded,
      total: totalSize,
      percentage,
      currentFile: currentFileName,
      currentBatch: currentBatchIndex + 1,
      totalBatches,
    })
  }

  const updateProgress = (batchIndex: number, loadedInBatch: number) => {
    if (!onProgress) {
      return
    }

    const batchSize = batchSizes.get(batchIndex) ?? 0
    const clampedLoaded = Math.min(loadedInBatch, batchSize)
    inFlightBytes.set(batchIndex, clampedLoaded)

    const firstFileName = batches[batchIndex]?.files[0]?.name ?? 'Uploading...'
    emitProgress(batchIndex, firstFileName)
  }

  const processBatch = async (batch: { index: number; files: File[] }) => {
    const formData = new FormData()
    batch.files.forEach((file) => formData.append('files', file))

    const batchSize = batch.files.reduce((sum, file) => sum + file.size, 0)
    batchSizes.set(batch.index, batchSize)

    try {
      const response = await api.post<PhotoUploadResponse>(`/galleries/${galleryId}/photos/batch`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            updateProgress(batch.index, progressEvent.loaded)
          } else {
            updateProgress(batch.index, Math.min(progressEvent.loaded, batchSize))
          }
        },
      })

      inFlightBytes.delete(batch.index)
      completedBytes += batchSize
      emitProgress(batch.index, batch.files[0]?.name ?? 'Completed')

      allResults.push(...response.data.results)
      successfulUploads += response.data.successful_uploads
      failedUploads += response.data.failed_uploads
    } catch (error) {
      inFlightBytes.delete(batch.index)
      completedBytes += batchSize

      const failedResults: PhotoUploadResult[] = batch.files.map((file) => ({
        filename: file.name,
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      }))

      allResults.push(...failedResults)
      failedUploads += batch.files.length
      emitProgress(batch.index, batch.files[0]?.name ?? 'Failed')
    }
  }

  let nextBatchIndex = 0

  const worker = async () => {
    while (nextBatchIndex < batches.length) {
      const currentIndex = nextBatchIndex
      nextBatchIndex += 1
      const batch = batches[currentIndex]
      await processBatch(batch)
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, batches.length) }, () => worker())
  await Promise.all(workers)

  return {
    results: allResults,
    total_files: files.length,
    successful_uploads: successfulUploads,
    failed_uploads: failedUploads,
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
