import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { galleryService, type Gallery } from '../services/galleryService'
import { formatDate } from '../lib/utils'
import { Plus, Calendar, ChevronLeft, ChevronRight, Trash2, Edit3, Check, X } from 'lucide-react'
import { Layout } from '../components/Layout'
import { ErrorDisplay } from '../components/ErrorDisplay'
import { useErrorHandler } from '../hooks/useErrorHandler'

export const DashboardPage = () => {
  const [galleries, setGalleries] = useState<Gallery[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [newGalleryName, setNewGalleryName] = useState('')
  const newGalleryInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  // Inline rename state
  const [renameGalleryId, setRenameGalleryId] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)
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
  // Focus input when create modal opens
  useEffect(() => {
    if (showModal) {
      newGalleryInputRef.current?.focus()
    }
  }, [showModal])
  // Focus input when inline rename begins
  useEffect(() => {
    if (renameGalleryId) {
      renameInputRef.current?.focus()
    }
  }, [renameGalleryId])

  // Open modal to enter gallery name
  const handleOpenModal = () => {
    setNewGalleryName('')
    clearError()
    setShowModal(true)
  }

  // Confirm creation with entered name
  const handleConfirmCreate = async () => {
    try {
      setIsCreating(true)
      await galleryService.createGallery(newGalleryName.trim())
      setShowModal(false)
      await fetchGalleries(1)
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

  // Begin inline rename for a gallery
  const beginInlineRename = (gallery: Gallery) => {
    clearError()
    setRenameGalleryId(gallery.id)
    setRenameInput(gallery.name)
  }

  // Cancel inline rename
  const cancelInlineRename = () => {
    setRenameGalleryId(null)
    setRenameInput('')
  }

  // Confirm inline rename
  const handleConfirmRename = async () => {
    if (!renameGalleryId) return
    try {
      setIsRenaming(true)
      await galleryService.updateGallery(renameGalleryId, renameInput.trim())
      setRenameGalleryId(null)
      await fetchGalleries(page)
    } catch (err: any) {
      handleError(err)
    } finally {
      setIsRenaming(false)
    }
  }


  const totalPages = Math.ceil(total / pageSize)

  const renderLoading = () => (
    <div className="flex items-center justify-center h-96">
      <div className="w-12 h-12 border-4 border-muted/60 dark:border-muted-dark/60 border-t-accent rounded-full animate-spin"></div>
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
    <div className="flex flex-col items-center justify-center h-96">
      <p className="text-muted text-lg mb-4">No galleries yet</p>
      {/* Button to create first gallery */}
      <button
        onClick={handleOpenModal}
        disabled={isCreating}
        className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-semibold py-3 px-6 rounded-lg shadow-sm border border-accent/20 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
      >
        {isCreating ? (
          <div className="w-5 h-5 border-2 border-border/20 border-t-accent rounded-full animate-spin"></div>
        ) : (
          <Plus className="h-5 w-5" />
        )}
        Create First Gallery
      </button>
    </div>
  )

  const renderGalleries = () => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {galleries.map((gallery) => (
          <div key={gallery.id} className="bg-surface dark:bg-surface-foreground/95 backdrop-blur-lg rounded-2xl p-8 border border-border dark:border-border/10 hover:transform hover:scale-101 hover:shadow-2xl ">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="bg-accent/20 p-2 rounded-lg flex-shrink-0 border border-accent/10">
                  <Calendar className="h-6 w-6 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  {renameGalleryId === gallery.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        ref={renameInputRef}
                        className="flex-1 p-2 border border-border rounded min-w-0 text-base bg-surface-foreground/5 text-text focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                        value={renameInput}
                        onChange={(e) => setRenameInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleConfirmRename();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelInlineRename();
                          }
                        }}
                      />
                      <button
                        onClick={handleConfirmRename}
                        disabled={isRenaming || !renameInput.trim()}
                        title="Confirm Rename"
                        aria-label="Confirm rename"
                        className="p-2 rounded-md flex items-center justify-center cursor-pointer hover:bg-surface-foreground/10 active:scale-95 focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        {isRenaming ? (
                          <div className="w-4 h-4 border-2 border-border/20 border-t-accent rounded-full animate-spin" />
                        ) : (
                          <Check className="w-5 h-5 text-green-500" />
                        )}
                      </button>
                      <button
                        onClick={cancelInlineRename}
                        title="Cancel Rename"
                        aria-label="Cancel rename"
                        className="p-2 rounded-md flex items-center justify-center cursor-pointer hover:bg-surface-foreground/10 active:scale-95 focus:outline-none focus:ring-2 focus:ring-danger"
                      >
                        <X className="w-5 h-5 text-red-500" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <h3 className="font-oswald text-base font-bold uppercase tracking-wide text-text break-words">
                        {gallery.name || `Gallery #${gallery.id}`}
                      </h3>
                      <p className="text-text-muted text-sm font-cuprum">
                        {formatDate(gallery.created_at)}
                      </p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => beginInlineRename(gallery)}
                  className="p-2 bg-warning/80 hover:bg-warning text-text dark:text-accent-foreground rounded-full  border border-border shadow-sm hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:ring-offset-1"
                  title="Rename Gallery"
                  aria-label={`Rename ${gallery.name || `Gallery #${gallery.id}`}`}
                >
                  <Edit3 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleDeleteGallery(gallery.id)}
                  className="p-2 bg-danger/80 hover:bg-danger text-text dark:text-accent-foreground rounded-full border border-border shadow-sm hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-danger/20 focus:ring-offset-1"
                  title="Delete Gallery"
                  aria-label={`Delete ${gallery.name || `Gallery #${gallery.id}`}`}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div>
              <Link
                to={`/galleries/${gallery.id}`}
                className="block w-full bg-accent text-accent-foreground font-semibold py-3 px-6 rounded-lg text-center  hover:-translate-y-0.5 hover:shadow-lg shadow-sm border border-accent/20 no-underline"
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
      <div className="flex items-center justify-between text-sm text-muted dark:text-muted-dark mt-8">
        <div>
          <p>
            Page <span className="font-bold text-text">{page}</span> of <span className="font-bold text-text">{totalPages}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchGalleries(page - 1)}
            disabled={page <= 1 || isLoading}
            className="p-2 bg-transparent border-2 border-border dark:border-border/40 text-muted dark:text-muted-dark hover:border-accent hover:text-accent rounded-lg  disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border dark:disabled:hover:border-border/40 disabled:hover:text-muted dark:disabled:hover:text-muted-dark"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => fetchGalleries(page + 1)}
            disabled={page >= totalPages || isLoading}
            className="p-2 bg-transparent border-2 border-border dark:border-border/40 text-muted dark:text-muted-dark hover:border-accent hover:text-accent rounded-lg  disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border dark:disabled:hover:border-border/40 disabled:hover:text-muted dark:disabled:hover:text-muted-dark"
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
            <h1 className="font-oswald text-4xl font-bold uppercase tracking-wider text-text">My Galleries</h1>
            <p className="text-muted font-cuprum text-lg">
              Your personal space to organize and share moments.
            </p>
          </div>
          <button
            onClick={handleOpenModal}
            disabled={isCreating}
            className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-semibold py-3 px-6 rounded-lg shadow-sm border border-accent/20  hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isCreating ? (
              <div className="w-5 h-5 border-2 border-border dark:border-border/40 rounded-full animate-spin"></div>
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

        {/* Modal for entering new gallery name */}
        {showModal && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="bg-surface dark:bg-surface-dark rounded-lg shadow-lg p-6 max-w-sm w-full">
              <h2 className="text-xl font-semibold mb-4 text-text">New Gallery</h2>
              <p className="text-muted mb-4">
                Enter a name for your new gallery.
              </p>
              <input
                ref={newGalleryInputRef}
                type="text"
                value={newGalleryName}
                onChange={(e) => setNewGalleryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleConfirmCreate()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setShowModal(false)
                  }
                }}
                className="w-full p-3 border border-border dark:border-border/40 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent bg-transparent text-text"
                placeholder="Gallery name"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-surface-1 dark:bg-surface-dark-1 rounded-lg text-text dark:text-text hover:bg-surface-2 dark:hover:bg-surface-dark-2"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmCreate}
                  disabled={isCreating || !newGalleryName.trim()}
                  className="px-4 py-2 bg-accent text-accent-foreground rounded-lg shadow-md  hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isCreating ? (
                    <div className="w-5 h-5 border-2 border-accent/20 border-t-accent rounded-full animate-spin"></div>
                  ) : (
                    'Create Gallery'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </Layout>
  )
}
