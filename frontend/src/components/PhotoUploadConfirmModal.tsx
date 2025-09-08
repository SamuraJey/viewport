import { useState, useEffect, useRef } from 'react'
import { X, Upload, FileImage, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { formatFileSize } from '../lib/utils'
import { photoService } from '../services/photoService'
import type { PhotoUploadResponse } from '../services/photoService'

interface FileWithPreview extends File {
    preview?: string
}

interface PhotoUploadConfirmModalProps {
    isOpen: boolean
    onClose: () => void
    files: File[]
    galleryId: string
    onUploadComplete: (result: PhotoUploadResponse) => void
}

interface UploadProgress {
    loaded: number
    total: number
    percentage: number
    currentFile: string
}

export const PhotoUploadConfirmModal = ({
    isOpen,
    onClose,
    files,
    galleryId,
    onUploadComplete
}: PhotoUploadConfirmModalProps) => {
    const [isUploading, setIsUploading] = useState(false)
    const [progress, setProgress] = useState<UploadProgress | null>(null)
    const [result, setResult] = useState<PhotoUploadResponse | null>(null)
    const [filePreviews, setFilePreviews] = useState<{ [key: string]: string }>({})
    const [showModal, setShowModal] = useState(false)
    const [showCancelWarning, setShowCancelWarning] = useState(false)
    const uploadButtonRef = useRef<HTMLButtonElement>(null)

    // Create image previews when files change
    useEffect(() => {
        if (!files.length) {
            setFilePreviews({})
            return
        }

        const previews: { [key: string]: string } = {}
        const loadPreviews = async () => {
            for (const file of files) {
                if (file.type.startsWith('image/')) {
                    try {
                        const preview = URL.createObjectURL(file)
                        previews[file.name] = preview
                    } catch (error) {
                        console.warn('Failed to create preview for', file.name, error)
                    }
                }
            }
            setFilePreviews(previews)
        }

        loadPreviews()

        // Cleanup function to revoke object URLs
        return () => {
            Object.values(previews).forEach(url => {
                if (url) URL.revokeObjectURL(url)
            })
        }
    }, [files])

    // Cleanup previews when component unmounts
    useEffect(() => {
        return () => {
            Object.values(filePreviews).forEach(url => {
                if (url) URL.revokeObjectURL(url)
            })
        }
    }, [filePreviews])

    // Handle modal animation
    useEffect(() => {
        if (isOpen) {
            setShowModal(true)
            // Focus upload button after modal opens
            const timer = setTimeout(() => {
                uploadButtonRef.current?.focus()
            }, 300)
            return () => clearTimeout(timer)
        } else {
            const timer = setTimeout(() => setShowModal(false), 200)
            return () => clearTimeout(timer)
        }
    }, [isOpen])

    // Handle Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                handleCancelAttempt()
            }
        }

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown)
            return () => document.removeEventListener('keydown', handleKeyDown)
        }
    }, [isOpen, isUploading, showCancelWarning, result])

    if (!isOpen && !showModal) return null

    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    const hasLargeFiles = files.some(file => file.size > 15 * 1024 * 1024)
    const hasInvalidTypes = files.some(file => !['image/jpeg', 'image/png', 'image/jpg'].includes(file.type))

    const handleUpload = async () => {
        setIsUploading(true)
        setProgress(null)
        setResult(null)

        try {
            const result = await photoService.uploadPhotos(galleryId, files, setProgress)
            setResult(result)
            onUploadComplete(result)
        } catch (error) {
            console.error('Upload failed:', error)
            setResult({
                results: files.map(file => ({
                    filename: file.name,
                    success: false,
                    error: 'Upload failed'
                })),
                total_files: files.length,
                successful_uploads: 0,
                failed_uploads: files.length
            })
        } finally {
            setIsUploading(false)
            setProgress(null)
        }
    }

    // Handle cancel attempt - show warning first, then close on second attempt
    const handleCancelAttempt = () => {
        if (showCancelWarning) {
            // Second attempt - close modal
            handleForceClose()
        } else {
            // First attempt - always show warning
            setShowCancelWarning(true)
        }
    }

    // Force close modal (used after warning confirmation)
    const handleForceClose = () => {
        // Clean up file previews
        Object.values(filePreviews).forEach(url => URL.revokeObjectURL(url))
        setFilePreviews({})
        setProgress(null)
        setResult(null)
        setIsUploading(false)
        setShowModal(false)
        setShowCancelWarning(false)
        onClose()
    }

    // Close modal and clean up
    const handleClose = () => {
        if (result) {
            // Upload is complete - close immediately
            onClose()
            setResult(null)
            setProgress(null)
            setShowCancelWarning(false)
        } else {
            // Show confirmation before closing
            handleCancelAttempt()
        }
    }

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            handleCancelAttempt()
        }
    }

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center overflow-y-auto transition-all duration-200 ${isOpen ? 'bg-black/50 backdrop-blur-sm' : 'bg-transparent backdrop-blur-0'
                }`}
            onClick={handleBackdropClick}
        >
            <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden m-4 my-8 transition-all duration-200 ${isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
                }`}>
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {result ? 'Upload Complete' : isUploading ? 'Uploading Photos...' : 'Confirm Photo Upload'}
                    </h2>
                    {!isUploading && result && (
                        <button
                            onClick={handleClose}
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    )}
                </div>

                {/* Cancel Warning */}
                {showCancelWarning && (
                    <div className="px-6 py-4 bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/20">
                        <div className="flex items-center gap-2 text-red-800 dark:text-red-200 mb-2">
                            <AlertTriangle className="w-5 h-5" />
                            <span className="font-medium">
                                {isUploading ? 'Cancel Upload?' : 'Close Window?'}
                            </span>
                        </div>
                        <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                            {isUploading
                                ? 'Are you sure you want to cancel the upload? This will stop all in-progress uploads.'
                                : 'Are you sure you want to close this window? Your selected files will be lost.'
                            }
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={handleForceClose}
                                className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                            >
                                {isUploading ? 'Yes, Cancel' : 'Yes, Close'}
                            </button>
                            <button
                                onClick={() => setShowCancelWarning(false)}
                                className="px-3 py-1 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 text-sm rounded hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                            >
                                {isUploading ? 'Continue Upload' : 'Stay Here'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-96">
                    {!result && !isUploading && (
                        <>
                            {/* Warning messages */}
                            {(hasLargeFiles || hasInvalidTypes) && (
                                <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-lg">
                                    <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200 mb-2">
                                        <AlertTriangle className="w-5 h-5" />
                                        <span className="font-medium">Warning</span>
                                    </div>
                                    <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                                        {hasLargeFiles && <li>• Some files exceed 15MB and will be rejected</li>}
                                        {hasInvalidTypes && <li>• Some files are not JPG/PNG format and will be rejected</li>}
                                    </ul>
                                </div>
                            )}

                            {/* Files list */}
                            <div className="space-y-2 mb-6">
                                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 mb-3">
                                    <FileImage className="w-5 h-5" />
                                    <span className="font-medium">{files.length} file{files.length > 1 ? 's' : ''} selected</span>
                                    <span className="text-sm text-gray-500">({formatFileSize(totalSize)} total)</span>
                                </div>

                                {files.map((file, index) => {
                                    const isLarge = file.size > 15 * 1024 * 1024
                                    const isInvalid = !['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)
                                    const hasError = isLarge || isInvalid
                                    const preview = filePreviews[file.name]

                                    return (
                                        <div
                                            key={index}
                                            className={`flex items-center gap-3 p-3 rounded-lg ${hasError
                                                    ? 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20'
                                                    : 'bg-gray-50 dark:bg-gray-700/50'
                                                }`}
                                        >
                                            {/* Image Preview */}
                                            <div className="w-12 h-12 flex-shrink-0">
                                                {preview ? (
                                                    <img
                                                        src={preview}
                                                        alt={file.name}
                                                        className="w-12 h-12 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                                                    />
                                                ) : (
                                                    <div className="w-12 h-12 bg-gray-200 dark:bg-gray-600 rounded-lg flex items-center justify-center">
                                                        <FileImage className={`w-6 h-6 ${hasError ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`} />
                                                    </div>
                                                )}
                                            </div>

                                            {/* File Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                    {file.name}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                                    {formatFileSize(file.size)} • {file.type}
                                                </div>
                                                {hasError && (
                                                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                                                        {isLarge && 'File too large (max 15MB)'}
                                                        {isInvalid && 'Invalid file type (only JPG/PNG)'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </>
                    )}

                    {/* Upload progress */}
                    {isUploading && progress && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Upload className="w-5 h-5 text-blue-500 animate-pulse" />
                                <span className="text-gray-900 dark:text-white">Uploading {progress.currentFile}...</span>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                    <span>{progress.percentage}% complete</span>
                                    <span>{formatFileSize(progress.loaded)} / {formatFileSize(progress.total)}</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                    <div
                                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${progress.percentage}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Upload results */}
                    {result && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-lg font-medium text-gray-900 dark:text-white">
                                {result.successful_uploads > 0 && result.failed_uploads === 0 && (
                                    <CheckCircle className="w-6 h-6 text-green-500" />
                                )}
                                {result.failed_uploads > 0 && (
                                    <XCircle className="w-6 h-6 text-red-500" />
                                )}
                                Upload Summary
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div className="text-green-600 dark:text-green-400">
                                    ✓ {result.successful_uploads} successful
                                </div>
                                <div className="text-red-600 dark:text-red-400">
                                    ✗ {result.failed_uploads} failed
                                </div>
                            </div>

                            {result.results.filter(r => !r.success).length > 0 && (
                                <div className="space-y-2">
                                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Failed uploads:</div>
                                    {result.results
                                        .filter(r => !r.success)
                                        .map((r, index) => (
                                            <div key={index} className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-500/10 rounded">
                                                <XCircle className="w-4 h-4 text-red-500" />
                                                <span className="text-sm text-gray-900 dark:text-white">{r.filename}</span>
                                                <span className="text-xs text-red-600 dark:text-red-400">{r.error}</span>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                    {result && (
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                        >
                            Close
                        </button>
                    )}
                    {!result && !isUploading && (
                        <>
                            <button
                                onClick={() => onClose()}
                                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                ref={uploadButtonRef}
                                onClick={handleUpload}
                                disabled={files.length === 0}
                                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                                <Upload className="w-4 h-4" />
                                Upload {files.length} Photo{files.length > 1 ? 's' : ''}
                            </button>
                        </>
                    )}
                    {isUploading && (
                        <div className="px-4 py-2 text-gray-500 dark:text-gray-400 text-sm">
                            Upload in progress... Please wait.
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
