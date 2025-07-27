import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { galleryService, type Gallery } from '../services/galleryService'
import { formatDate } from '../lib/utils'
import { Plus, Calendar, RefreshCw, ChevronLeft, ChevronRight, Image as ImageIcon, Trash2 } from 'lucide-react'
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


  // Handler for deleting a gallery
  const handleDeleteGallery = async (galleryId: string) => {
    if (window.confirm('Are you sure you want to delete this gallery and all its contents?')) {
      try {
        await galleryService.deleteGallery(galleryId)
        await fetchGalleries(page)
      } catch (err) {
        setError('Failed to delete gallery. Please try again.')
        console.error('Error deleting gallery:', err)
      }
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  const renderLoading = () => (
    <div className="flex items-center justify-center" style={{ height: '24rem' }}>
      <div className="loading-spinner" style={{ width: '3rem', height: '3rem' }}></div>
    </div>
  )

  const renderError = () => (
    <div className="error-message" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span>{error}</span>
      <button
        onClick={() => fetchGalleries(page)}
        className="hover:opacity-75 transition-all"
        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
      >
        <RefreshCw style={{ height: '1.25rem', width: '1.25rem' }} />
      </button>
    </div>
  )

  const renderEmptyState = () => (
    <div className="text-center modern-card" style={{ padding: '4rem 2rem' }}>
      <ImageIcon style={{ margin: '0 auto', height: '4rem', width: '4rem', color: '#9ca3af' }} />
      <h3 className="modern-heading" style={{ marginTop: '1rem', fontSize: '1.5rem', marginBottom: '0.5rem' }}>No galleries yet</h3>
      <p className="modern-subheading" style={{ marginBottom: '1.5rem' }}>
        Get started by creating your first gallery.
      </p>
      <button
        onClick={handleCreateGallery}
        disabled={isCreating}
        className="modern-btn"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
      >
        {isCreating ? (
          <div className="loading-spinner" style={{ width: '1.25rem', height: '1.25rem' }}></div>
        ) : (
          <Plus style={{ height: '1.25rem', width: '1.25rem' }} />
        )}
        Create First Gallery
      </button>
    </div>
  )

  const renderGalleries = () => (
    <>
      <div className="photo-grid">
        {galleries.map((gallery) => (
          <div key={gallery.id} className="photo-card">
            <div className="photo-card-content">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '0.5rem', borderRadius: '0.5rem' }}>
                    <Calendar style={{ height: '1.5rem', width: '1.5rem', color: '#60a5fa' }} />
                  </div>
                  <div>
                    <h3 className="photo-card-title">
                      Gallery #{gallery.id}
                    </h3>
                    <p className="photo-card-description">
                      {formatDate(gallery.created_at)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteGallery(gallery.id)}
                  className="modern-btn"
                  style={{ 
                    padding: '0.5rem', 
                    background: 'rgba(239, 68, 68, 0.8)', 
                    borderRadius: '50%',
                    minWidth: 'auto',
                    margin: 0
                  }}
                  title="Delete Gallery"
                >
                  <Trash2 style={{ width: '1.25rem', height: '1.25rem' }} />
                </button>
              </div>
              <div>
                <Link
                  to={`/galleries/${gallery.id}`}
                  className="modern-btn w-full"
                  style={{ 
                    display: 'block', 
                    textAlign: 'center',
                    textDecoration: 'none',
                    width: '100%'
                  }}
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
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        fontSize: '0.875rem', 
        color: '#9ca3af',
        marginTop: '2rem'
      }}>
        <div>
          <p>
            Page <span style={{ fontWeight: 'bold', color: '#fff' }}>{page}</span> of <span style={{ fontWeight: 'bold', color: '#fff' }}>{totalPages}</span>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => fetchGalleries(page - 1)}
            disabled={page <= 1 || isLoading}
            className="modern-btn modern-btn--secondary"
            style={{ 
              padding: '0.5rem',
              minWidth: 'auto',
              opacity: (page <= 1 || isLoading) ? 0.5 : 1,
              cursor: (page <= 1 || isLoading) ? 'not-allowed' : 'pointer'
            }}
          >
            <ChevronLeft style={{ height: '1.25rem', width: '1.25rem' }} />
          </button>
          <button
            onClick={() => fetchGalleries(page + 1)}
            disabled={page >= totalPages || isLoading}
            className="modern-btn modern-btn--secondary"
            style={{ 
              padding: '0.5rem',
              minWidth: 'auto',
              opacity: (page >= totalPages || isLoading) ? 0.5 : 1,
              cursor: (page >= totalPages || isLoading) ? 'not-allowed' : 'pointer'
            }}
          >
            <ChevronRight style={{ height: '1.25rem', width: '1.25rem' }} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <Layout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ 
          display: 'flex', 
          flexDirection: window.innerWidth < 640 ? 'column' : 'row',
          justifyContent: 'space-between', 
          alignItems: window.innerWidth < 640 ? 'flex-start' : 'center',
          gap: '1rem'
        }}>
          <div>
            <h1 className="modern-heading">My Galleries</h1>
            <p className="modern-subheading">
              Your personal space to organize and share moments.
            </p>
          </div>
          <button
            onClick={handleCreateGallery}
            disabled={isCreating}
            className="modern-btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {isCreating ? (
              <div className="loading-spinner" style={{ width: '1.25rem', height: '1.25rem' }}></div>
            ) : (
              <Plus style={{ height: '1.25rem', width: '1.25rem' }} />
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
