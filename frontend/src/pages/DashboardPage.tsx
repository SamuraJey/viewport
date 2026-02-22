import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { type Gallery } from '../services/galleryService';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Layout } from '../components/Layout';
import { ErrorDisplay } from '../components/ErrorDisplay';
import { useDashboardActions } from '../hooks';
import { DashboardGalleryCard } from '../components/dashboard/DashboardGalleryCard';
import { CreateGalleryModal } from '../components/dashboard/CreateGalleryModal';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 340, damping: 26 },
  },
  exit: { opacity: 0, scale: 0.94, y: -8, transition: { duration: 0.15 } },
};

export const DashboardPage = () => {
  const {
    galleries,
    isCreating,
    isRenaming,
    pagination,
    createModal,
    error,
    clearError,
    isLoading,
    ConfirmModal,
    fetchGalleries,
    createGallery,
    deleteGallery,
    renameGallery,
  } = useDashboardActions();

  const [newGalleryName, setNewGalleryName] = useState('');
  const [newGalleryShootingDate, setNewGalleryShootingDate] = useState('');
  const newGalleryInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Inline rename state
  const [renameGalleryId, setRenameGalleryId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');

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
  const handleConfirmCreate = () => {
    createGallery(newGalleryName, newGalleryShootingDate);
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
    await renameGallery(renameGalleryId, renameInput);
    setRenameGalleryId(null);
  };

  const renderLoading = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-surface dark:bg-surface-foreground/95 rounded-2xl p-8 border border-border dark:border-border/10 animate-pulse"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-muted/20 dark:bg-muted-dark/20 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted/20 dark:bg-muted-dark/20 rounded w-3/4" />
              <div className="h-3 bg-muted/20 dark:bg-muted-dark/20 rounded w-1/2" />
            </div>
          </div>
          <div className="h-11 bg-muted/20 dark:bg-muted-dark/20 rounded-lg" />
        </div>
      ))}
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
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <AnimatePresence mode="popLayout">
          {galleries.map((gallery) => (
            <DashboardGalleryCard
              key={gallery.id}
              gallery={gallery}
              isRenamingThis={renameGalleryId === gallery.id}
              renameInput={renameInput}
              isRenaming={isRenaming}
              renameInputRef={renameInputRef}
              onRenameInputChange={setRenameInput}
              onConfirmRename={handleConfirmRename}
              onCancelRename={cancelInlineRename}
              onBeginRename={beginInlineRename}
              onDelete={deleteGallery}
              variants={cardVariants}
            />
          ))}
        </AnimatePresence>
      </motion.div>
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
        <AnimatePresence>
          <CreateGalleryModal
            isOpen={createModal.isOpen}
            isCreating={isCreating}
            newGalleryName={newGalleryName}
            shootingDate={newGalleryShootingDate}
            inputRef={newGalleryInputRef}
            onClose={createModal.close}
            onConfirm={handleConfirmCreate}
            onNameChange={setNewGalleryName}
            onShootingDateChange={setNewGalleryShootingDate}
          />
        </AnimatePresence>

        {/* Confirmation Modal */}
        {ConfirmModal}
      </div>
    </Layout>
  );
};
