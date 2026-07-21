import { useCallback } from 'react';

import { useCopyToClipboard } from './useCopyToClipboard';
import { useModal } from './useModal';

export const usePublicGalleryShare = () => {
  const {
    isOpen: isShareDrawerOpen,
    open: openShareDrawer,
    close: closeShareDrawerState,
  } = useModal();
  const { isOpen: isQrDrawerOpen, open: openQrDrawer, close: closeQrDrawer } = useModal();
  const {
    copied: shareLinkCopied,
    copy: copyShareLink,
    reset: resetShareLinkCopied,
  } = useCopyToClipboard();

  const closeShareDrawer = useCallback(() => {
    closeQrDrawer();
    resetShareLinkCopied();
    closeShareDrawerState();
  }, [closeQrDrawer, closeShareDrawerState, resetShareLinkCopied]);

  const handleShareDrawerOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        openShareDrawer();
      } else {
        closeShareDrawer();
      }
    },
    [closeShareDrawer, openShareDrawer],
  );

  const handleQrDrawerOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        openQrDrawer();
      } else {
        closeQrDrawer();
      }
    },
    [closeQrDrawer, openQrDrawer],
  );

  return {
    isShareDrawerOpen,
    isQrDrawerOpen,
    shareLinkCopied,
    openShareDrawer,
    handleShareDrawerOpenChange,
    handleQrDrawerOpenChange,
    copyShareLink,
  };
};
