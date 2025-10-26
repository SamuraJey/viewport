import React, { useEffect, useRef, useState } from 'react'
import { X, FileText, Check } from 'lucide-react'

export interface PhotoRenameModalProps {
    isOpen: boolean
    onClose: () => void
    currentFilename: string
    onRename: (newFilename: string) => Promise<void>
}

export const PhotoRenameModal: React.FC<PhotoRenameModalProps> = ({
    isOpen,
    onClose,
    currentFilename,
    onRename
}) => {
    const [filename, setFilename] = useState('')
    const [isRenaming, setIsRenaming] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isOpen) {
            setFilename(currentFilename)
            setError(null)
            setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.focus()
                    const lastDotIndex = currentFilename.lastIndexOf('.')
                    if (lastDotIndex > 0) {
                        inputRef.current.setSelectionRange(0, lastDotIndex)
                    } else {
                        inputRef.current.select()
                    }
                }
            }, 100)
        }
    }, [isOpen, currentFilename])

    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && !isRenaming) handleRename()
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, isRenaming])

    const handleRename = async () => {
        if (!filename.trim()) {
            setError('Filename cannot be empty')
            return
        }

        if (filename === currentFilename) {
            onClose()
            return
        }

        setIsRenaming(true)
        setError(null)
        try {
            await onRename(filename.trim())
            onClose()
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to rename photo. Please try again.')
        } finally {
            setIsRenaming(false)
        }
    }

    const handleCancel = () => {
        if (!isRenaming) onClose()
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={handleCancel} />

            <div className="relative bg-surface dark:bg-surface-foreground rounded-lg shadow-xl w-full max-w-md mx-4 transform transition-all">
                <div className="flex items-center justify-between p-6 border-b border-border dark:border-border">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h2 className="text-lg font-semibold text-text dark:text-white">Rename Photo</h2>
                    </div>
                    <button onClick={handleCancel} disabled={isRenaming} className="p-1 text-text-muted hover:text-text dark:hover:text-text transition-all duration-200 hover:scale-110 disabled:opacity-50">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6">
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="filename" className="block text-sm font-medium text-text dark:text-text mb-2">Filename</label>
                            <input
                                ref={inputRef}
                                id="filename"
                                type="text"
                                value={filename}
                                onChange={(e) => setFilename(e.target.value)}
                                disabled={isRenaming}
                                className="w-full px-3 py-2 border border-border dark:border-border rounded-lg focus:ring-2 focus:ring-accent focus:border-accent dark:bg-surface-foreground dark:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                                placeholder="Enter new filename"
                            />
                        </div>

                        {error && (
                            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
                    <button onClick={handleCancel} disabled={isRenaming} className="px-4 py-2 text-text dark:text-text-muted hover:bg-surface dark:hover:bg-surface-foreground rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50">
                        Cancel
                    </button>
                    <button
                        onClick={handleRename}
                        disabled={isRenaming || !filename.trim() || filename === currentFilename}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                    >
                        {isRenaming ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                Renaming...
                            </>
                        ) : (
                            <>
                                <Check className="w-4 h-4" />
                                Rename
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
