import { useState, useRef, useCallback } from 'react';
import type { PhotoUploaderHandle } from '../components/PhotoUploader';

export const useGalleryDragAndDrop = (
  photoUploaderRef: React.RefObject<PhotoUploaderHandle | null>,
) => {
  const [isPageDragActive, setIsPageDragActive] = useState(false);
  const dragDepthRef = useRef(0);

  const hasDraggedFiles = useCallback(
    (event: React.DragEvent<HTMLDivElement>) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files'),
    [],
  );

  const handleGalleryDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsPageDragActive(true);
    },
    [hasDraggedFiles],
  );

  const handleGalleryDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      if (!isPageDragActive) setIsPageDragActive(true);
    },
    [hasDraggedFiles, isPageDragActive],
  );

  const handleGalleryDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsPageDragActive(false);
      }
    },
    [hasDraggedFiles],
  );

  const handleGalleryDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsPageDragActive(false);
      if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        photoUploaderRef.current?.handleExternalFiles(event.dataTransfer.files);
      }
    },
    [hasDraggedFiles, photoUploaderRef],
  );

  return {
    isPageDragActive,
    handleGalleryDragEnter,
    handleGalleryDragOver,
    handleGalleryDragLeave,
    handleGalleryDrop,
  };
};
