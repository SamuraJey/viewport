import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { galleryService, type GalleryDetail } from '../services/galleryService'
import { photoService } from '../services/photoService'
import { shareLinkService, type ShareLink } from '../services/shareLinkService'
import { Layout } from '../components/Layout'
import { formatDate } from '../lib/utils'
import { 
  Loader2, 
  Trash2, 
  Share2, 
  Link as LinkIcon, 
  Copy, 
  Check,
  ArrowLeft,
  ImageOff
} from 'lucide-react'
import { PhotoUploader } from '../components/PhotoUploader'

export const GalleryPage = () => {
  const { id } = useParams<{ id: string }>()
  const [gallery, setGallery] = useState<GalleryDetail | null>(null)
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [isCreatingLink, setIsCreatingLink] = useState(false)
  const [error, setError] = useState('')
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
  // For lazy loading
  const imgRefs = useRef<(HTMLImageElement | null)[]>([])

  const galleryId = id!

  const fetchData = async () => {
    try {
      setIsLoading(true)
      setError('')
      const galleryData = await galleryService.getGallery(galleryId)
      setGallery(galleryData)
      setShareLinks(galleryData.share_links || [])
    } catch (err) {
      setError('Failed to load gallery data. Please try again.')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [galleryId])

  // Handler for photo upload
  const handlePhotoUpload = async (files: File[]) => {
    setIsUploading(true)
    setUploadError('')
    try {
      await Promise.all(files.map(file => photoService.uploadPhoto(galleryId, file)))
      await fetchData()
    } catch (err) {
      setUploadError('Photo upload failed. Please try again.')
      console.error(err)
    } finally {
      setIsUploading(false)
    }
  }

  // Handler for deleting a photo
  const handleDeletePhoto = async (photoId: string) => {
    if (window.confirm('Are you sure you want to delete this photo?')) {
      try {
        await photoService.deletePhoto(photoId)
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
        window.location.href = '/dashboard'
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
      await fetchData()
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
        await fetchData()
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

  // Lazy loading effect
  useEffect(() => {
    if (!gallery || !gallery.photos.length) return
    const observer = new window.IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement
            if (img.dataset.src) {
              img.src = img.dataset.src
              img.onload = () => {
                img.classList.remove('opacity-0')
                img.classList.add('opacity-100')
              }
              observer.unobserve(img)
            }
          }
        })
      },
      { rootMargin: '100px' }
    )
    imgRefs.current.forEach(img => {
      if (img) observer.observe(img)
    })
    return () => observer.disconnect()
  }, [gallery])

  if (isLoading || !gallery) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex items-center">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            <span className="ml-3 text-lg text-gray-300">Loading gallery...</span>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Link to="/dashboard" className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 mb-4">
              <ArrowLeft className="w-4 h-4" />
              Back to Galleries
            </Link>
            <h1 className="text-4xl font-bold text-white">Gallery #{gallery.id}</h1>
            <p className="mt-2 text-lg text-gray-400">Created on {formatDate(gallery.created_at)}</p>
          </div>
          <button
            onClick={handleDeleteGallery}
            className="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 focus:ring-offset-gray-900"
            title="Delete Gallery"
          >
            <Trash2 className="w-5 h-5" />
            Delete Gallery
          </button>
        </div>

        {/* Photo Section */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-white mb-2">Photos ({gallery.photos.length})</h2>
            <PhotoUploader onUpload={handlePhotoUpload} isUploading={isUploading} />
            {uploadError && (
              <div className="mt-2 text-red-400 bg-red-500/20 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                {uploadError}
                <button onClick={() => setUploadError('')} className="ml-2 text-xs text-white bg-red-400/40 px-2 py-1 rounded">Dismiss</button>
              </div>
            )}
          </div>
          {gallery.photos.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {gallery.photos.map((photo, idx) => (
                <div key={photo.id} className="relative group aspect-square">
                  <img
                    ref={el => { imgRefs.current[idx] = el }}
                    data-src={photo.url}
                    alt={`Photo ${photo.id}`}
                    className="w-full h-full object-cover rounded-lg opacity-0 transition-opacity duration-500"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button onClick={() => handleDeletePhoto(photo.id)} className="p-2 bg-red-600/80 rounded-full text-white hover:bg-red-500">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 border-2 border-dashed border-gray-600 rounded-lg">
              <ImageOff className="mx-auto h-12 w-12 text-gray-500" />
              <h3 className="mt-4 text-lg font-medium text-gray-300">No photos in this gallery</h3>
              <p className="mt-2 text-sm text-gray-500">Upload your first photo to get started.</p>
            </div>
          )}
        </div>

        {/* Share Links Section */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-semibold text-white">Share Links</h2>
              <button
                onClick={handleCreateShareLink}
                disabled={isCreatingLink}
                className="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 focus:ring-offset-gray-900 disabled:opacity-50"
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
                  <li key={link.id} className="bg-white/10 p-4 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <LinkIcon className="w-5 h-5 text-gray-400" />
                      <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate">
                        {fullUrl}
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => copyToClipboard(fullUrl)} className="p-2 text-gray-300 hover:text-white hover:bg-white/20 rounded-lg">
                        {copiedLink === fullUrl ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
                      </button>
                      <button onClick={() => handleDeleteShareLink(link.id)} className="p-2 text-gray-300 hover:text-white hover:bg-red-500/50 rounded-lg">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-gray-600 rounded-lg">
              <Share2 className="mx-auto h-12 w-12 text-gray-500" />
              <h3 className="mt-4 text-lg font-medium text-gray-300">No share links created</h3>
              <p className="mt-2 text-sm text-gray-500">Create a link to share this gallery with others.</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
