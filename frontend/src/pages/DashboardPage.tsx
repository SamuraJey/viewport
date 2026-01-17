import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { galleryService, type Gallery } from '../services/galleryService';
import { formatDateOnly } from '../lib/utils';
import { Plus, Calendar, ChevronLeft, ChevronRight, Trash2, Edit3, Check, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { ErrorDisplay } from '../components/ErrorDisplay';
import { useErrorHandler, useConfirmation, usePagination, useModal } from '../hooks';

export const DashboardPage = () => {
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newGalleryName, setNewGalleryName] = useState('');
  const [newGalleryShootingDate, setNewGalleryShootingDate] = useState('');
  const newGalleryInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Inline rename state
  const [renameGalleryId, setRenameGalleryId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Use new hooks
  const pagination = usePagination({ pageSize: 9 });
  const createModal = useModal();
  const { error, clearError, handleError, isLoading, setLoading } = useErrorHandler();
  const { openConfirm, ConfirmModal } = useConfirmation();

  const fetchGalleries = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      try {
        clearError();
        const response = await galleryService.getGalleries(pageNum, pagination.pageSize);
        setGalleries(response.galleries);
        pagination.setTotal(response.total);
      } catch (err: unknown) {
        handleError(err);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearError, handleError, setLoading, pagination.pageSize, pagination.setTotal],
  );

  useEffect(() => {
    fetchGalleries(pagination.page);
  }, [fetchGalleries, pagination.page]);

  // Focus input when create modal opens
  useEffect(() => {
    if (createModal.isOpen) {
      newGalleryInputRef.current?.focus();
    }
  }, [createModal.isOpen]);

  // Focus input when inline rename begins
  useEffect(() => {
    if (renameGalleryId) {
      renameInputRef.current?.focus();
    }
  }, [renameGalleryId]);

  // Open modal to enter gallery name
  const handleOpenModal = () => {
    setNewGalleryName('');
    setNewGalleryShootingDate(new Date().toISOString().slice(0, 10));
    clearError();
    createModal.open();
  };

  // Confirm creation with entered name
  const handleConfirmCreate = async () => {
    if (!newGalleryName.trim()) return;

    try {
      setIsCreating(true);
      await galleryService.createGallery({
        name: newGalleryName.trim(),
        shooting_date: newGalleryShootingDate || undefined,
      });
      createModal.close();
      pagination.firstPage();
      await fetchGalleries(1);
    } catch (err: unknown) {
      handleError(err);
    } finally {
      setIsCreating(false);
    }
  };

  // Handler for deleting a gallery
  const handleDeleteGallery = async (gallery: Gallery) => {
    openConfirm({
      title: 'Delete Gallery?',
      message: `Are you sure you want to delete "${gallery.name || `Gallery #${gallery.id}`}" and all its contents? This action cannot be undone.`,
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await galleryService.deleteGallery(gallery.id);
          await fetchGalleries(pagination.page);
        } catch (err) {
          handleError(err);
          throw err;
        }
      },
    });
  };

  // Begin inline rename for a gallery
  const beginInlineRename = (gallery: Gallery) => {
    clearError();
    setRenameGalleryId(gallery.id);
    setRenameInput(gallery.name);
  };

  // Cancel inline rename
  const cancelInlineRename = () => {
    setRenameGalleryId(null);
    setRenameInput('');
  };

  // Confirm inline rename
  const handleConfirmRename = async () => {
    if (!renameGalleryId) return;
    try {
      setIsRenaming(true);
      await galleryService.updateGallery(renameGalleryId, renameInput.trim());
      setRenameGalleryId(null);
      await fetchGalleries(pagination.page);
    } catch (err: unknown) {
      handleError(err);
    } finally {
      setIsRenaming(false);
    }
  };

  const renderLoading = () => (
    <div className="flex items-center justify-center h-96">
      <div className="w-12 h-12 border-4 border-muted/60 dark:border-muted-dark/60 border-t-accent rounded-full animate-spin"></div>
    </div>
  );

  const renderError = () => (
    <ErrorDisplay
      error={error!}
      onRetry={() => fetchGalleries(pagination.page)}
      onDismiss={clearError}
      variant="banner"
    />
  );
  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center h-96">
      <p className="text-muted text-lg mb-4">No galleries yet</p>
      {/* Button to create first gallery */}
      <button
        onClick={handleOpenModal}
        disabled={isCreating}
        className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-semibold py-3 px-6 rounded-lg shadow-sm hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 border border-accent/20 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        aria-label="Create your first gallery"
      >
        {isCreating ? (
          <div className="w-5 h-5 border-2 border-border/20 border-t-accent rounded-full animate-spin"></div>
        ) : (
          <Plus className="h-5 w-5" />
        )}
        Create First Gallery
      </button>
    </div>
  );

  const renderGalleries = () => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {galleries.map((gallery) => (
          <div
            key={gallery.id}
            className="bg-surface dark:bg-surface-foreground/95 backdrop-blur-lg rounded-2xl p-8 border border-border dark:border-border/10 hover:transform hover:scale-101 hover:shadow-2xl "
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="bg-accent/20 p-2 rounded-lg shrink-0 border border-accent/10">
                  <Calendar className="h-6 w-6 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  {renameGalleryId === gallery.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={renameInputRef}
                        className="flex-1 px-3 py-2 border-2 border-accent/50 dark:border-accent/40 rounded-lg min-w-0 text-base bg-surface-1 dark:bg-surface-dark-1 text-text dark:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent shadow-sm hover:border-accent/70 transition-all duration-200"
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
                        placeholder="Gallery name..."
                        aria-label="Rename gallery input"
                      />
                      <button
                        onClick={handleConfirmRename}
                        disabled={isRenaming || !renameInput.trim()}
                        title="Save (Enter)"
                        aria-label="Confirm rename"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-500/90 hover:bg-green-500 border border-green-600/50 text-white shadow-sm hover:shadow-md transition-all duration-200 hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                      >
                        {isRenaming ? (
                          <div className="w-4 h-4 border-2 border-border/20 border-t-accent rounded-full animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={cancelInlineRename}
                        title="Cancel (Esc)"
                        aria-label="Cancel rename"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger/20 hover:bg-danger/30 border border-danger/40 text-danger transition-all duration-200 hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <h3 className="font-oswald text-base font-bold uppercase tracking-wide text-text wrap-break-word">
                        {gallery.name || `Gallery #${gallery.id}`}
                      </h3>
                      <p className="text-muted text-sm font-cuprum">
                        {formatDateOnly(gallery.shooting_date || gallery.created_at)}
                      </p>
                    </>
                  )}
                </div>
              </div>
              {renameGalleryId !== gallery.id && (
                <div className="flex gap-2">
                  <button
                    onClick={() => beginInlineRename(gallery)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/20 hover:bg-accent/30 border border-accent/40 text-accent shadow-sm hover:shadow-md hover:scale-110 transition-all duration-200 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                    title="Rename Gallery"
                    aria-label={`Rename ${gallery.name || `Gallery #${gallery.id}`}`}
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteGallery(gallery)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-danger/20 hover:bg-danger/30 border border-danger/40 text-danger shadow-sm hover:shadow-md hover:scale-110 transition-all duration-200 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
                    title="Delete Gallery"
                    aria-label={`Delete ${gallery.name || `Gallery #${gallery.id}`}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            <div>
              <Link
                to={`/galleries/${gallery.id}`}
                className="block w-full bg-accent text-accent-foreground font-semibold py-3 px-6 rounded-lg text-center hover:scale-105 active:scale-95 hover:shadow-lg shadow-sm border border-accent/20 no-underline transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                aria-label={`Manage ${gallery.name || `Gallery #${gallery.id}`}`}
              >
                Manage Gallery
              </Link>
            </div>
          </div>
        ))}
      </div>
      {renderPagination()}
    </>
  );

  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-between text-sm text-muted dark:text-muted-dark mt-8">
        <div>
          <p>
            Page <span className="font-bold text-text">{pagination.page}</span> of{' '}
            <span className="font-bold text-text">{pagination.totalPages}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              pagination.previousPage();
              fetchGalleries(pagination.page - 1);
            }}
            disabled={pagination.isFirstPage || isLoading}
            className="p-2 bg-transparent border-2 border-border dark:border-border/40 text-muted dark:text-muted-dark hover:border-accent hover:text-accent hover:scale-110 active:scale-95 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border dark:disabled:hover:border-border/40 disabled:hover:text-muted dark:disabled:hover:text-muted-dark disabled:shadow-none disabled:hover:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => {
              pagination.nextPage();
              fetchGalleries(pagination.page + 1);
            }}
            disabled={pagination.isLastPage || isLoading}
            className="p-2 bg-transparent border-2 border-border dark:border-border/40 text-muted dark:text-muted-dark hover:border-accent hover:text-accent hover:scale-110 active:scale-95 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border dark:disabled:hover:border-border/40 disabled:hover:text-muted dark:disabled:hover:text-muted-dark disabled:shadow-none disabled:hover:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            aria-label="Next page"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="font-oswald text-4xl font-bold uppercase tracking-wider text-text">
              My Galleries
            </h1>
            <p className="text-muted font-cuprum text-lg">
              Your personal space to organize and share moments.
            </p>
          </div>
          <button
            onClick={handleOpenModal}
            disabled={isCreating}
            className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-semibold py-3 px-6 rounded-lg shadow-sm hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 border border-accent/20 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            aria-label="Create new gallery"
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

        {isLoading
          ? renderLoading()
          : galleries.length === 0
            ? renderEmptyState()
            : renderGalleries()}

        {/* Modal for entering new gallery name */}
        {createModal.isOpen && (
          <div
            className="fixed inset-0 flex items-center justify-center z-50 bg-black/30 backdrop-blur-sm"
            onClick={createModal.close}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div
              className="bg-surface dark:bg-surface-dark rounded-lg shadow-lg p-6 max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="modal-title" className="text-xl font-semibold mb-4 text-text">
                New Gallery
              </h2>
              <p className="text-muted mb-4">Enter a name for your new gallery.</p>
              <input
                ref={newGalleryInputRef}
                type="text"
                value={newGalleryName}
                onChange={(e) => setNewGalleryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirmCreate();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    createModal.close();
                  }
                }}
                className="w-full p-3 border border-border dark:border-border/40 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent hover:border-accent/60 bg-transparent text-text transition-all duration-200"
                placeholder="Gallery name"
                aria-label="Gallery name"
              />
              <label
                className="text-sm font-medium text-text mb-2 block"
                htmlFor="shooting-date-input"
              >
                Shooting date
              </label>
              <input
                id="shooting-date-input"
                type="date"
                value={newGalleryShootingDate}
                onChange={(e) => setNewGalleryShootingDate(e.target.value)}
                className="w-full p-3 border border-border dark:border-border/40 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent hover:border-accent/60 bg-transparent text-text transition-all duration-200"
                aria-label="Gallery shooting date"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={createModal.close}
                  className="px-4 py-2 bg-surface-1 dark:bg-surface-dark-1 rounded-lg text-text dark:text-text hover:bg-surface-2 dark:hover:bg-surface-dark-2 shadow-sm hover:shadow-md hover:scale-105 active:scale-95 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                  aria-label="Cancel creating gallery"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmCreate}
                  disabled={isCreating || !newGalleryName.trim()}
                  className="px-4 py-2 bg-accent text-accent-foreground rounded-lg shadow-sm hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                  aria-label="Create Gallery"
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

        {/* Confirmation Modal */}
        {ConfirmModal}
      </div>
    </Layout>
  );
};
