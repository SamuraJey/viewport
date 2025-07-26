import { useRef, useState } from 'react'
import { Upload, Loader2, Image as ImageIcon, XCircle } from 'lucide-react'
import { formatFileSize } from '../lib/utils'

interface PhotoUploaderProps {
  onUpload: (files: File[]) => Promise<void>
  isUploading: boolean
}

interface FileWithMeta {
  file: File
  error?: string
  progress?: number
}

const MAX_SIZE_MB = 15
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/jpg']

export const PhotoUploader = ({ onUpload, isUploading }: PhotoUploaderProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [files, setFiles] = useState<FileWithMeta[]>([])
  const [error, setError] = useState('')

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
    setFiles(validated)
    setError('')
    const validFiles = validated.filter(f => !f.error).map(f => f.file)
    if (validFiles.length > 0) {
      onUpload(validFiles).catch(() => setError('Photo upload failed.'))
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

  return (
    <div>
      <div
        className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 transition-colors cursor-pointer ${dragActive ? 'border-blue-500 bg-blue-50/30' : 'border-gray-600 bg-white/5'}`}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        tabIndex={0}
        role="button"
        aria-label="Upload photos"
      >
        <Upload className="w-10 h-10 text-blue-400 mb-2" />
        <p className="text-lg text-white font-semibold">Drag & drop photos here</p>
        <p className="text-sm text-gray-400">or click to select files (JPG/PNG, ≤ 15MB)</p>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInput}
          multiple
          accept="image/jpeg,image/png,image/jpg"
          className="hidden"
        />
      </div>
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map((f, idx) => (
            <div key={idx} className="flex items-center gap-3 bg-white/10 rounded-lg px-4 py-2">
              <ImageIcon className="w-5 h-5 text-gray-400" />
              <span className="text-white text-sm truncate max-w-xs">{f.file.name}</span>
              <span className="text-gray-400 text-xs">{formatFileSize(f.file.size)}</span>
              {f.error ? (
                <span className="text-red-400 text-xs flex items-center gap-1"><XCircle className="w-4 h-4" />{f.error}</span>
              ) : isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              ) : null}
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="mt-2 text-red-400 bg-red-500/20 px-3 py-2 rounded-lg text-sm">{error}</div>
      )}
    </div>
  )
}
