import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { galleryService, type Gallery } from '../services/galleryService'
import { formatDate } from '../lib/utils'
import { Plus, Calendar, Loader2, RefreshCw, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react'
import { Layout } from '../components/Layout'

export const DashboardPage = () => {
  const [galleries, setGalleries] = useState<Gallery[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 9

  const fetchGalleries = async (pageNum = 1) => {
    setIsLoading(true)
    try {
      setError('')
      const response = await galleryService.getGalleries(pageNum, pageSize)
      setGalleries(response.galleries)
      setTotal(response.total)
      setPage(pageNum)
    } catch (err: any) {
      setError('Failed to load galleries. Please try again.')
      console.error('Error fetching galleries:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchGalleries()
  }, [])

  const handleCreateGallery = async () => {
    try {
      setIsCreating(true)
      setError('')
      await galleryService.createGallery()
      await fetchGalleries(1) // Refresh and go to first page
    } catch (err: any) {
      setError('Failed to create a new gallery.')
      console.error('Error creating gallery:', err)
    } finally {
      setIsCreating(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  const renderLoading = () => (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
    </div>
  )

  const renderError = () => (
    <div className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg flex items-center justify-between">
      <span>{error}</span>
      <button
        onClick={() => fetchGalleries(page)}
        className="text-red-300 hover:text-red-200 transition-colors"
      >
        <RefreshCw className="h-5 w-5" />
      </button>
    </div>
  )

  const renderEmptyState = () => (
    <div className="text-center py-16 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10">
      <ImageIcon className="mx-auto h-16 w-16 text-gray-400" />
      <h3 className="mt-4 text-xl font-semibold text-white">No galleries yet</h3>
      <p className="mt-2 text-sm text-gray-400">
        Get started by creating your first gallery.
      </p>
      <button
        onClick={handleCreateGallery}
        disabled={isCreating}
        className="mt-6 inline-flex items-center gap-2 px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
      >
        {isCreating ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Plus className="h-5 w-5" />
        )}
        Create First Gallery
      </button>
    </div>
  )

  const renderGalleries = () => (
    <>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {galleries.map((gallery) => (
          <div
            key={gallery.id}
            className="bg-white/5 backdrop-blur-sm rounded-2xl shadow-lg border border-white/10 hover:border-white/20 transition-all duration-300 group"
          >
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-500/20 p-2 rounded-lg">
                    <Calendar className="h-6 w-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      Gallery #{gallery.id}
                    </h3>
                    <p className="text-sm text-gray-400">
                      {formatDate(gallery.created_at)}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="mt-6">
                <Link
                  to={`/galleries/${gallery.id}`}
                  className="w-full block bg-white/10 text-white text-center py-3 px-4 rounded-lg text-sm font-semibold hover:bg-white/20 transition-colors duration-300"
                >
                  Manage Gallery
                </Link>
              </div>
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
      <div className="flex items-center justify-between text-sm text-gray-400 mt-8">
        <div>
          <p>
            Page <span className="font-bold text-white">{page}</span> of <span className="font-bold text-white">{totalPages}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchGalleries(page - 1)}
            disabled={page <= 1 || isLoading}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => fetchGalleries(page + 1)}
            disabled={page >= totalPages || isLoading}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-4xl font-bold text-white">My Galleries</h1>
            <p className="mt-2 text-lg text-gray-400">
              Your personal space to organize and share moments.
            </p>
          </div>
          <button
            onClick={handleCreateGallery}
            disabled={isCreating}
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
          >
            {isCreating ? (
              <Loader2 className="h-5 w-5 animate-spin" />
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
