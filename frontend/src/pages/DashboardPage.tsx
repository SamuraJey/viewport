import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { galleryService, type Gallery } from '../services/galleryService'
import { formatDate } from '../lib/utils'
import { Plus, Calendar, ChevronLeft, ChevronRight, Image as ImageIcon, Trash2 } from 'lucide-react'
import { Layout } from '../components/Layout'
import { ErrorDisplay } from '../components/ErrorDisplay'
import { useErrorHandler } from '../hooks/useErrorHandler'

export const DashboardPage = () => {
  const [galleries, setGalleries] = useState<Gallery[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 9

  const { error, clearError, handleError, isLoading, setLoading } = useErrorHandler()

  const fetchGalleries = async (pageNum = 1) => {
    setLoading(true)
    try {
      clearError()
      const response = await galleryService.getGalleries(pageNum, pageSize)
      setGalleries(response.galleries)
      setTotal(response.total)
      setPage(pageNum)
    } catch (err: any) {
      handleError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchGalleries()
  }, [])

  const handleCreateGallery = async () => {
    try {
      setIsCreating(true)
      clearError()
      await galleryService.createGallery()
      await fetchGalleries(1) // Refresh and go to first page
    } catch (err: any) {
      handleError(err)
    } finally {
      setIsCreating(false)
    }
  }

  // Handler for deleting a gallery
  const handleDeleteGallery = async (galleryId: string) => {
    if (window.confirm('Are you sure you want to delete this gallery and all its contents?')) {
      try {
        await galleryService.deleteGallery(galleryId)
        await fetchGalleries(page)
      } catch (err) {
        handleError(err)
      }
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  const renderLoading = () => (
    <div className="flex items-center justify-center h-96">
      <div className="w-12 h-12 border-4 border-gray-300 dark:border-gray-600 border-t-primary-500 rounded-full animate-spin"></div>
    </div>
  )

  const renderError = () => (
    <ErrorDisplay 
      error={error!}
      onRetry={() => fetchGalleries(page)}
      onDismiss={clearError}
      variant="banner"
    />
  )

  const renderEmptyState = () => (
    <div className="text-center bg-gray-100 dark:bg-gray-900/95 backdrop-blur-lg rounded-2xl p-16 border border-gray-200 dark:border-white/10">
      <ImageIcon className="mx-auto h-16 w-16 text-gray-400 dark:text-gray-500 mb-4" />
      <h3 className="font-oswald text-2xl font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-2">No galleries yet</h3>
      <p className="text-gray-600 dark:text-gray-400 font-cuprum mb-6">
        Get started by creating your first gallery.
      </p>
      <button
        onClick={handleCreateGallery}
        disabled={isCreating}
        className="inline-flex items-center gap-2 bg-gradient-to-r from-primary-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-lg transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
      >
        {isCreating ? (
          <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
        ) : (
          <Plus className="h-5 w-5" />
        )}
        Create First Gallery
      </button>
    </div>
  )

  const renderGalleries = () => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {galleries.map((gallery) => (
          <div key={gallery.id} className="bg-gray-50 dark:bg-gray-900/95 backdrop-blur-lg rounded-2xl p-6 border border-gray-200 dark:border-white/10 hover:transform hover:-translate-y-1 hover:shadow-2xl transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-primary-500/20 p-2 rounded-lg">
                  <Calendar className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-oswald text-lg font-bold uppercase tracking-wide text-gray-900 dark:text-white">
                    Gallery #{gallery.id}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm font-cuprum">
                    {formatDate(gallery.created_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDeleteGallery(gallery.id)}
                className="p-2 bg-red-500/80 hover:bg-red-500 text-white rounded-full transition-colors"
                title="Delete Gallery"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            <div>
              <Link
                to={`/galleries/${gallery.id}`}
                className="block w-full bg-gradient-to-r from-primary-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-lg text-center transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 no-underline"
              >
                Manage Gallery
              </Link>
            </div>
          </div>
        ))}
      </div>
      {renderPagination()}
    </>
  )

  const renderPagination = () => {
    if (totalPages <= 1) return null

    return (
      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mt-8">
        <div>
          <p>
            Page <span className="font-bold text-gray-900 dark:text-white">{page}</span> of <span className="font-bold text-gray-900 dark:text-white">{totalPages}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchGalleries(page - 1)}
            disabled={page <= 1 || isLoading}
            className="p-2 bg-transparent border-2 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-primary-500 hover:text-primary-500 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-300 dark:disabled:hover:border-gray-600 disabled:hover:text-gray-600 dark:disabled:hover:text-gray-300"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => fetchGalleries(page + 1)}
            disabled={page >= totalPages || isLoading}
            className="p-2 bg-transparent border-2 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-primary-500 hover:text-primary-500 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-300 dark:disabled:hover:border-gray-600 disabled:hover:text-gray-600 dark:disabled:hover:text-gray-300"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="font-oswald text-4xl font-bold uppercase tracking-wider text-gray-900 dark:text-white">My Galleries</h1>
            <p className="text-gray-600 dark:text-gray-400 font-cuprum text-lg">
              Your personal space to organize and share moments.
            </p>
          </div>
          <button
            onClick={handleCreateGallery}
            disabled={isCreating}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-primary-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-lg transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isCreating ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              <Plus className="h-5 w-5" />
            )}
            New Gallery
          </button>
        </div>

        {error && renderError()}

        {isLoading ? renderLoading() : (
          galleries.length === 0 ? renderEmptyState() : renderGalleries()
        )}
      </div>
    </Layout>
  )
}
