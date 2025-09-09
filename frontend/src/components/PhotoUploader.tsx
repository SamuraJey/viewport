import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { PhotoUploadConfirmModal } from './PhotoUploadConfirmModal'
import type { PhotoUploadResponse } from '../services/photoService'

interface PhotoUploaderProps {
  galleryId: string
  onUploadComplete: (result: PhotoUploadResponse) => void
}

interface FileWithMeta {
  file: File
  error?: string
  progress?: number
}

const MAX_SIZE_MB = 15
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/jpg']

export const PhotoUploader = ({ galleryId, onUploadComplete }: PhotoUploaderProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [files, setFiles] = useState<FileWithMeta[]>([])
  const [error, setError] = useState('')
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  const validateFiles = (fileList: FileList | File[]): FileWithMeta[] => {
    return Array.from(fileList).map((file) => {
      let error = ''
      if (!ACCEPTED_TYPES.includes(file.type)) {
        error = 'Only JPG and PNG files are allowed.'
      } else if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        error = `File size must be ≤ ${MAX_SIZE_MB} MB.`
      }
      return { file, error }
    })
  }

  const handleFiles = (fileList: FileList | File[]) => {
    const validated = validateFiles(fileList)
    setError('')

    const validFiles = validated.filter(f => !f.error).map(f => f.file)
    if (validFiles.length > 0) {
      setFiles(validated)
      setShowConfirmModal(true)
    } else {
      // Show only error files if any
      const errorFiles = validated.filter(f => f.error)
      setFiles(errorFiles)
      if (errorFiles.length > 0) {
        setError('Some files have errors and cannot be uploaded')
      }
    }
  }



  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragActive(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragActive(false)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
    }
  }

  const handleUploadComplete = (result: PhotoUploadResponse) => {
    setShowConfirmModal(false)
    setFiles([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    onUploadComplete(result)
  }

  const handleCloseConfirmModal = () => {
    setShowConfirmModal(false)
    // Clear all files when modal is cancelled
    setFiles([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div>
      <div
        className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 transition-colors cursor-pointer ${dragActive
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-gray-50 dark:bg-gray-800/50'
          }`}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        tabIndex={0}
        role="button"
        aria-label="Upload photos"
      >
        <Upload className="w-10 h-10 text-blue-500 dark:text-blue-400 mb-2" />
        <p className="text-lg text-gray-900 dark:text-white font-semibold">
          {files.length > 0 ? `${files.length} file${files.length > 1 ? 's' : ''} selected` : 'Drag & drop photos here'}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {files.length > 0 ? 'Opening upload confirmation...' : 'or click to select files (JPG/PNG, ≤ 15MB)'}
        </p>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInput}
          multiple
          accept="image/jpeg,image/png,image/jpg"
          className="hidden"
        />
      </div>

      {error && (
        <div className="mt-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/20 px-3 py-2 rounded-lg text-sm">{error}</div>
      )}

      {/* Upload Confirmation Modal */}
      <PhotoUploadConfirmModal
        isOpen={showConfirmModal}
        onClose={handleCloseConfirmModal}
        files={files.filter(f => !f.error).map(f => f.file)}
        galleryId={galleryId}
        onUploadComplete={handleUploadComplete}
      />
    </div>
  )
}
