import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { galleryService, type GalleryDetail } from '../services/galleryService'
import { photoService, type PhotoResponse } from '../services/photoService'
import type { PhotoUploadResponse } from '../services/photoService'
import { shareLinkService, type ShareLink } from '../services/shareLinkService'
import { Layout } from '../components/Layout'
import { PhotoModal } from '../components/PhotoModal'
import { formatDate } from '../lib/utils'
import {
  Loader2,
  Trash2,
  Share2,
  Link as LinkIcon,
  Copy,
  Check,
  ArrowLeft,
  ImageOff,
  Star,
  StarOff
} from 'lucide-react'
import { PhotoUploader } from '../components/PhotoUploader'

export const GalleryPage = () => {
  const { id } = useParams<{ id: string }>()
  const [gallery, setGallery] = useState<GalleryDetail | null>(null)
  const [photoUrls, setPhotoUrls] = useState<PhotoResponse[]>([])
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [uploadError, setUploadError] = useState('')
  const [isCreatingLink, setIsCreatingLink] = useState(false)
  const [error, setError] = useState('')
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null)

  const galleryId = id!

  const fetchGalleryDetails = useCallback(async () => {
    try {
      const galleryData = await galleryService.getGallery(galleryId)
      setGallery(galleryData)
      setShareLinks(galleryData.share_links || [])
    } catch (err) {
      setError('Failed to load gallery data. Please try again.')
      console.error(err)
    }
  }, [galleryId])

  const fetchPhotoUrls = useCallback(async () => {
    try {
      const urls = await photoService.getAllPhotoUrls(galleryId)
      setPhotoUrls(urls)
    } catch (err) {
      setError('Failed to load photo URLs. Please try again.')
      console.error(err)
    }
  }, [galleryId])

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError('')
    await Promise.all([fetchGalleryDetails(), fetchPhotoUrls()])
    setIsLoading(false)
  }, [fetchGalleryDetails, fetchPhotoUrls])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handler for photo upload completion
  const handleUploadComplete = (result: PhotoUploadResponse) => {
    setUploadError('')
    if (result.successful_uploads > 0) {
      fetchData() // Refresh gallery data and photo URLs
    }
    if (result.failed_uploads > 0) {
      setUploadError(`${result.failed_uploads} of ${result.total_files} photos failed to upload`)
    }
  }

  // Handler for renaming a photo
  const handleRenamePhoto = async (photoId: string, currentFilename: string) => {
    const newFilename = prompt('Enter new filename:', currentFilename)
    if (newFilename && newFilename !== currentFilename) {
      try {
        await photoService.renamePhoto(galleryId, photoId, newFilename)
        await fetchData() // Refresh gallery data and photo URLs
      } catch (err) {
        setError('Failed to rename photo. Please try again.')
        console.error(err)
      }
    }
  }

  // Handler for deleting a photo
  const handleDeletePhoto = async (photoId: string) => {
    if (window.confirm('Are you sure you want to delete this photo?')) {
      try {
        await photoService.deletePhoto(galleryId, photoId)
        await fetchData()
      } catch (err) {
        setError('Failed to delete photo. Please try again.')
        console.error(err)
      }
    }
  }
  // Handler for deleting the gallery from detail page
  const handleDeleteGallery = async () => {
    if (window.confirm('Are you sure you want to delete this gallery and all its contents?')) {
      try {
        await galleryService.deleteGallery(galleryId)
        window.location.href = '/'
      } catch (err) {
        setError('Failed to delete gallery. Please try again.')
        console.error('Error deleting gallery:', err)
      }
    }
  }

  // Handler for creating a share link
  const handleCreateShareLink = async () => {
    setIsCreatingLink(true)
    setError('')
    try {
      await shareLinkService.createShareLink(galleryId)
      await fetchGalleryDetails() // Only need to refresh gallery details
    } catch (err) {
      setError('Failed to create share link. Please try again.')
      console.error(err)
    } finally {
      setIsCreatingLink(false)
    }
  }

  // Handler for deleting a share link
  const handleDeleteShareLink = async (linkId: string) => {
    if (window.confirm('Are you sure you want to delete this share link?')) {
      try {
        await shareLinkService.deleteShareLink(galleryId, linkId)
        await fetchGalleryDetails() // Only need to refresh gallery details
      } catch (err) {
        setError('Failed to delete share link. Please try again.')
        console.error(err)
      }
    }
  }

  // Handler for copying a link to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedLink(text)
    setTimeout(() => setCopiedLink(null), 2000)
  }

  // Photo modal handlers
  const openPhoto = (index: number) => {
    setSelectedPhotoIndex(index)
  }

  const closePhoto = () => {
    setSelectedPhotoIndex(null)
  }

  const goToPrevPhoto = () => {
    if (selectedPhotoIndex !== null) {
      const newIndex = selectedPhotoIndex > 0 ? selectedPhotoIndex - 1 : photoUrls.length - 1
      setSelectedPhotoIndex(newIndex)
    }
  }

  const goToNextPhoto = () => {
    if (selectedPhotoIndex !== null) {
      const newIndex = selectedPhotoIndex < photoUrls.length - 1 ? selectedPhotoIndex + 1 : 0
      setSelectedPhotoIndex(newIndex)
    }
  }

  const handleSetCover = async (photoId: string) => {
    try {
      await galleryService.setCoverPhoto(galleryId, photoId)
      await fetchGalleryDetails()
    } catch (err) {
      setError('Failed to set cover photo. Please try again.')
      console.error(err)
    }
  }

  const handleClearCover = async () => {
    try {
      await galleryService.clearCoverPhoto(galleryId)
      await fetchGalleryDetails()
    } catch (err) {
      setError('Failed to clear cover photo. Please try again.')
      console.error(err)
    }
  }

  if (isLoading) {
    // ... (keep existing loading state)
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex items-center">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            <span className="ml-3 text-lg text-gray-600 dark:text-gray-300">Loading gallery...</span>
          </div>
        </div>
      </Layout>
    )
  }

  if (error && !gallery) {
    // ... (keep existing error state)
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <div className="text-red-400 text-lg font-medium">Failed to load gallery</div>
            <div className="text-gray-600 dark:text-gray-400">{error}</div>
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Try Again
            </button>
            <div>
              <Link to="/" className="text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 text-sm">
                ← Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (!gallery) {
    // ... (keep existing not found state)
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <div className="text-gray-600 dark:text-gray-400 text-lg">Gallery not found</div>
            <Link to="/" className="text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-8">
        {/* ... (keep existing header section) */}
        <div className="flex flex-col gap-4">
          <div>
            <Link to="/" className="flex items-center gap-2 text-sm text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 mb-4">
              <ArrowLeft className="w-4 h-4" />
              Back to Galleries
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
                  {gallery.name || `Gallery #${gallery.id}`}
                </h1>
                <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">Created on {formatDate(gallery.created_at)}</p>
              </div>
              <button
                onClick={handleDeleteGallery}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/30 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border border-red-200 dark:border-red-500/20 rounded-lg transition-all duration-200"
                title="Delete Gallery"
              >
                <Trash2 className="w-4 h-4" />
                Delete Gallery
              </button>
            </div>
          </div>
        </div>

        {/* Photo Section */}
        <div className="bg-gray-50 dark:bg-white/5 backdrop-blur-sm rounded-2xl p-4 lg:p-6 xl:p-8 border border-gray-200 dark:border-white/10">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Photos ({photoUrls.length})</h2>
            <PhotoUploader galleryId={galleryId} onUploadComplete={handleUploadComplete} />
            {uploadError && (
              <div className="mt-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/20 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                {uploadError}
                <button onClick={() => setUploadError('')} className="ml-2 text-xs text-white bg-red-500 dark:bg-red-400/40 px-2 py-1 rounded">Dismiss</button>
              </div>
            )}
            {error && (
              <div className="mt-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/20 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                {error}
                <button onClick={() => setError('')} className="ml-2 text-xs text-white bg-red-500 dark:bg-red-400/40 px-2 py-1 rounded">Dismiss</button>
              </div>
            )}
          </div>
          {photoUrls.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 lg:gap-8">
              {photoUrls.map((photo, index) => (
                <div key={photo.id} className="relative group bg-gray-50 dark:bg-gray-800 rounded-lg h-80">
                  {/* Action Panel - floating pop-up above container */}
                  <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 z-20 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 p-2 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700">
                    {/* Pop-up arrow */}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white/95 dark:border-t-gray-800/95"></div>

                    <div className="flex justify-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openPhoto(index)
                        }}
                        className="flex items-center justify-center w-8 h-8 p-1 bg-white/20 hover:bg-white/30 text-gray-700 dark:text-gray-300 rounded-lg transition-all duration-200"
                        title="Open photo"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                      </button>
                      {gallery.cover_photo_id === photo.id ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleClearCover()
                          }}
                          className="flex items-center justify-center w-8 h-8 p-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-600 rounded-lg transition-all duration-200"
                          title="Clear cover photo"
                        >
                          <StarOff className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSetCover(photo.id)
                          }}
                          className="flex items-center justify-center w-8 h-8 p-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-600 rounded-lg transition-all duration-200"
                          title="Set as cover"
                        >
                          <Star className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRenamePhoto(photo.id, photo.filename)
                        }}
                        className="flex items-center justify-center w-8 h-8 p-1 bg-white/20 hover:bg-white/30 text-gray-700 dark:text-gray-300 rounded-lg transition-all duration-200"
                        title="Rename photo"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          // Download functionality
                          const link = document.createElement('a')
                          link.href = photo.url
                          link.download = photo.filename
                          document.body.appendChild(link)
                          link.click()
                          document.body.removeChild(link)
                        }}
                        className="flex items-center justify-center w-8 h-8 p-1 bg-white/20 hover:bg-white/30 text-gray-700 dark:text-gray-300 rounded-lg transition-all duration-200"
                        title="Download photo"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeletePhoto(photo.id)
                        }}
                        className="flex items-center justify-center w-8 h-8 p-1 bg-red-500/20 hover:bg-red-500/30 text-red-600 rounded-lg transition-all duration-200"
                        title="Delete photo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Photo - takes full container space */}
                  <button
                    onClick={() => openPhoto(index)}
                    className="w-full h-full p-0 border-0 bg-transparent cursor-pointer absolute inset-0"
                    aria-label={`Photo ${photo.id}`}
                  >
                    <img
                      src={photo.url}
                      alt={`Photo ${photo.id}`}
                      className="w-full h-full object-contain rounded-lg transition-opacity"
                      loading="lazy"
                    />
                  </button>

                  {/* Filename - overlay at bottom */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 to-transparent p-3 rounded-b-lg">
                    <p className="text-sm text-white truncate text-center font-medium drop-shadow-md" title={photo.filename}>
                      {photo.filename}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
              <ImageOff className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
              <h3 className="mt-4 text-lg font-medium text-gray-600 dark:text-gray-300">No photos in this gallery</h3>
              <p className="mt-2 text-sm text-gray-500">Upload your first photo to get started.</p>
            </div>
          )}
        </div>

        {/* ... (keep existing share links section) */}
        <div className="bg-gray-50 dark:bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 dark:border-white/10">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Share Links</h2>
              <button
                onClick={handleCreateShareLink}
                disabled={isCreatingLink}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingLink ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}
                Create New Link
              </button>
            </div>
          </div>

          {shareLinks.length > 0 ? (
            <ul className="space-y-3">
              {shareLinks.map(link => {
                const fullUrl = `${window.location.origin}/share/${link.id}`
                return (
                  <li key={link.id} className="bg-gray-100 dark:bg-white/10 p-4 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <LinkIcon className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                      <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline truncate">
                        {fullUrl}
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => copyToClipboard(fullUrl)} className="flex items-center justify-center w-8 h-8 p-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 hover:text-green-300 rounded-lg transition-all duration-200">
                        {copiedLink === fullUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <button onClick={() => handleDeleteShareLink(link.id)} className="flex items-center justify-center w-8 h-8 p-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 rounded-lg transition-all duration-200">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
              <Share2 className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
              <h3 className="mt-4 text-lg font-medium text-gray-600 dark:text-gray-300">No share links created</h3>
              <p className="mt-2 text-sm text-gray-500">Create a link to share this gallery with others.</p>
            </div>
          )}
        </div>
      </div>

      {/* Photo Modal */}
      <PhotoModal
        photos={photoUrls.map(p => ({ id: p.id, url: p.url, created_at: '', gallery_id: galleryId }))}
        selectedIndex={selectedPhotoIndex}
        onClose={closePhoto}
        onPrevious={goToPrevPhoto}
        onNext={goToNextPhoto}
        isPublic={false}
      />
    </Layout>
  )
}
