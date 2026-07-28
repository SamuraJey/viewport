import { useCallback, useEffect, useState } from 'react';

import { useCopyToClipboard } from './useCopyToClipboard';
import { useModal } from './useModal';

interface PublicGallerySharePayload {
  title: string;
  text: string;
  url: string;
}

const browserSupportsNativeShare = () =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function';

const isShareCancellation = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  error.name === 'AbortError';

export const usePublicGalleryShare = (payload: PublicGallerySharePayload) => {
  const {
    isOpen: isShareDrawerOpen,
    open: openShareDrawerState,
    close: closeShareDrawerState,
  } = useModal();
  const { isOpen: isQrDrawerOpen, open: openQrDrawer, close: closeQrDrawer } = useModal();
  const [isNativeShareSupported, setIsNativeShareSupported] = useState(
    browserSupportsNativeShare,
  );
  const [nativeShareError, setNativeShareError] = useState('');
  const {
    copied: shareLinkCopied,
    copy: copyShareLink,
    reset: resetShareLinkCopied,
  } = useCopyToClipboard();

  useEffect(() => {
    setIsNativeShareSupported(browserSupportsNativeShare());
  }, []);

  const openShareDrawer = useCallback(() => {
    setNativeShareError('');
    openShareDrawerState();
  }, [openShareDrawerState]);

  const closeShareDrawer = useCallback(() => {
    closeQrDrawer();
    resetShareLinkCopied();
    setNativeShareError('');
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

  const shareViaDevice = useCallback(async () => {
    if (!browserSupportsNativeShare()) {
      return;
    }

    setNativeShareError('');
    try {
      await navigator.share(payload);
      closeShareDrawer();
    } catch (error) {
      if (isShareCancellation(error)) {
        return;
      }
      setNativeShareError("Couldn't open device sharing. Try Copy link instead.");
    }
  }, [closeShareDrawer, payload]);

  return {
    isShareDrawerOpen,
    isQrDrawerOpen,
    shareLinkCopied,
    isNativeShareSupported,
    nativeShareError,
    openShareDrawer,
    handleShareDrawerOpenChange,
    handleQrDrawerOpenChange,
    copyShareLink,
    shareViaDevice,
  };
};
