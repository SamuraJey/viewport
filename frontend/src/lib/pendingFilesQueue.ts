/**
 * Cross-page handoff for files staged from the Project page's "Upload folder"
 * flow. The Project page creates a gallery, enqueues the selected files here,
 * and navigates to the new gallery. The Gallery page consumes the queue once
 * its uploader is ready and feeds the files into the existing review queue.
 *
 * Files are held in memory only (never serialized or sent anywhere), so the
 * handoff survives the Project → Gallery route change without a backend change.
 */
const pendingFilesByGallery = new Map<string, File[]>();

export const enqueuePendingFiles = (galleryId: string, files: File[]): void => {
  if (!galleryId || files.length === 0) return;
  pendingFilesByGallery.set(galleryId, files);
};

/**
 * Remove and return the queued files for a gallery. Returns an empty array when
 * nothing is pending, so a consumer can safely call this once and the queue is
 * cleared (idempotent under StrictMode double-invocation).
 */
export const consumePendingFiles = (galleryId: string): File[] => {
  if (!galleryId) return [];
  const files = pendingFilesByGallery.get(galleryId);
  if (!files) return [];
  pendingFilesByGallery.delete(galleryId);
  return files;
};

/** Drop any queued files for a gallery without returning them. */
export const clearPendingFiles = (galleryId: string): void => {
  if (galleryId) pendingFilesByGallery.delete(galleryId);
};
