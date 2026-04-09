import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useDeferredValue,
  useTransition,
} from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { PhotoRenameModal } from '../components/PhotoRenameModal';
import { ShareLinkEditorModal } from '../components/share-links/ShareLinkEditorModal';
import { usePhotoLightbox } from '../hooks/usePhotoLightbox';
import { GalleryHeader } from '../components/gallery/GalleryHeader';
import { ShareLinksSection } from '../components/gallery/ShareLinksSection';
import { GallerySelectionSessionsPanel } from '../components/gallery/GallerySelectionSessionsPanel';
import { GalleryDragOverlay } from '../components/gallery/GalleryDragOverlay';
import { GalleryPhotoSection } from '../components/gallery/GalleryPhotoSection';
import {
  GalleryInitialLoadingState,
  GalleryLoadErrorState,
  GalleryNotFoundState,
} from '../components/gallery/GalleryPageStates';
import { type PhotoUploaderHandle } from '../components/PhotoUploader';
import { usePagination, useSelection, useGalleryActions, useGalleryDragAndDrop } from '../hooks';
import { shareLinkService } from '../services/shareLinkService';
import { handleApiError } from '../lib/errorHandling';
import type { GalleryPhotoSortBy, SelectionSession, ShareLink, SortOrder } from '../types';

const DEFAULT_SORT_BY: GalleryPhotoSortBy = 'uploaded_at';
const DEFAULT_SORT_ORDER: SortOrder = 'desc';
const DEFAULT_PUBLIC_SORT_BY: GalleryPhotoSortBy = 'original_filename';
const DEFAULT_PUBLIC_SORT_ORDER: SortOrder = 'asc';
const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_INPUT_ID = 'gallery-photo-search';

interface FavoritesUserTab {
  key: string;
  shareLinkId: string;
  sessionId: string;
  clientName: string;
  status: string;
  selectedCount: number;
  sessionCount: number;
  shareLinkLabel: string | null;
  updatedAt: string;
}

const createSelectionSessionCacheKey = (shareLinkId: string, sessionId: string): string =>
  `${shareLinkId}:${sessionId}`;

const hashFavoriteIdentityKey = (value: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
};

const createFavoritesUserTabKey = (identityKey: string): string =>
  `favorites-user-${hashFavoriteIdentityKey(identityKey)}`;

const isGalleryPhotoSortBy = (value: string | null): value is GalleryPhotoSortBy =>
  value === 'uploaded_at' || value === 'original_filename' || value === 'file_size';

const normalizeSortByParam = (value: string | null): GalleryPhotoSortBy | null => {
  if (value === 'created_at') {
    return 'uploaded_at';
  }

  return isGalleryPhotoSortBy(value) ? value : null;
};

const isSortOrder = (value: string | null): value is SortOrder =>
  value === 'asc' || value === 'desc';

export const GalleryPage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const galleryId = id!;
  const [searchParams, setSearchParams] = useSearchParams();

  const urlSearch = searchParams.get('search') ?? '';
  const activeSearch = urlSearch.trim();
  const sortByParam = searchParams.get('sort_by');
  const orderParam = searchParams.get('order');
  const sortBy: GalleryPhotoSortBy = normalizeSortByParam(sortByParam) ?? DEFAULT_SORT_BY;
  const sortOrder: SortOrder = isSortOrder(orderParam) ? orderParam : DEFAULT_SORT_ORDER;

  const [searchInput, setSearchInput] = useState(urlSearch);
  const [publicSortByInput, setPublicSortByInput] =
    useState<GalleryPhotoSortBy>(DEFAULT_PUBLIC_SORT_BY);
  const [publicSortOrderInput, setPublicSortOrderInput] =
    useState<SortOrder>(DEFAULT_PUBLIC_SORT_ORDER);
  const [activeContentTab, setActiveContentTab] = useState<'project' | 'favorites'>('project');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showInitialLoadingState, setShowInitialLoadingState] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShareLink, setEditingShareLink] = useState<ShareLink | null>(null);
  const [photoSizeById, setPhotoSizeById] = useState<Record<string, number>>({});
  const [favoritesTabs, setFavoritesTabs] = useState<FavoritesUserTab[]>([]);
  const [selectedFavoritesTabKey, setSelectedFavoritesTabKey] = useState<string | null>(null);
  const [selectedFavoritesSessionDetail, setSelectedFavoritesSessionDetail] =
    useState<SelectionSession | null>(null);
  const [hasLoadedFavorites, setHasLoadedFavorites] = useState(false);
  const [isLoadingSelectionRows, setIsLoadingSelectionRows] = useState(false);
  const [isLoadingSelectionDetail, setIsLoadingSelectionDetail] = useState(false);
  const [isMutatingSelectionSession, setIsMutatingSelectionSession] = useState(false);
  const [selectionSessionsError, setSelectionSessionsError] = useState('');
  const [, startTabTransition] = useTransition();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const photoUploaderRef = useRef<PhotoUploaderHandle | null>(null);
  const lastFailedShootingDateSaveRef = useRef<string | null>(null);
  const lastFailedPublicSortSaveRef = useRef<string | null>(null);
  const selectionSessionCacheRef = useRef<Map<string, SelectionSession>>(new Map());
  const selectionSessionInFlightRef = useRef<Map<string, Promise<SelectionSession>>>(new Map());

  // Use new hooks
  const pagination = usePagination({ pageSize: 100, syncWithUrl: true });
  const selection = useSelection<string>();

  const updateFilterQueryParams = useCallback(
    (updates: {
      search?: string | null;
      sortBy?: GalleryPhotoSortBy;
      order?: SortOrder;
      resetPage?: boolean;
    }) => {
      const nextParams = new URLSearchParams(searchParams);

      if (updates.search !== undefined) {
        if (updates.search) {
          nextParams.set('search', updates.search);
        } else {
          nextParams.delete('search');
        }
      }

      if (updates.sortBy !== undefined) {
        if (updates.sortBy === DEFAULT_SORT_BY) {
          nextParams.delete('sort_by');
        } else {
          nextParams.set('sort_by', updates.sortBy);
        }
      }

      if (updates.order !== undefined) {
        if (updates.order === DEFAULT_SORT_ORDER) {
          nextParams.delete('order');
        } else {
          nextParams.set('order', updates.order);
        }
      }

      if (updates.resetPage) {
        nextParams.set('page', '1');
      }

      if (nextParams.toString() !== searchParams.toString()) {
        setSearchParams(nextParams);
      }
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  const deferredSearchInput = useDeferredValue(searchInput);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const normalizedSearch = deferredSearchInput.trim();
      if (normalizedSearch !== activeSearch) {
        updateFilterQueryParams({
          search: normalizedSearch || null,
          resetPage: true,
        });
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [deferredSearchInput, activeSearch, updateFilterQueryParams]);

  const {
    gallery,
    photoUrls,
    shareLinks,
    isInitialLoading,
    isLoadingPhotos,
    isLoadingShareLinks,
    shareLinksError,
    uploadError,
    setUploadError,
    actionInfo,
    setActionInfo,
    isCreatingLink,
    isDownloadingZip,
    shootingDateInput,
    setShootingDateInput,
    isSavingShootingDate,
    isSavingPublicSortSettings,
    error,
    clearError,
    ConfirmModal,
    renameModal,
    fetchGalleryDetails,
    fetchShareLinks,
    handleUploadComplete,
    handleSaveShootingDate,
    handleSavePublicSortSettings,
    handleDeleteGallery,
    handleDownloadGallery,
    handleDownloadSelectedPhotos,
    handleSetCover,
    handleClearCover,
    handleCreateShareLink,
    handleUpdateShareLink,
    handleDeleteShareLink,
    handleRenamePhoto,
    handleRenameConfirm,
    handleDeletePhoto,
    handleDeleteMultiplePhotos: handleDeletePhotos, // Renamed to avoid name clash
  } = useGalleryActions({
    galleryId,
    filters: {
      search: activeSearch || undefined,
      sort_by: sortBy,
      order: sortOrder,
    },
    pagination,
  });

  useEffect(() => {
    if (!gallery) {
      return;
    }

    setPublicSortByInput(gallery.public_sort_by ?? DEFAULT_PUBLIC_SORT_BY);
    setPublicSortOrderInput(gallery.public_sort_order ?? DEFAULT_PUBLIC_SORT_ORDER);
  }, [gallery]);

  const currentGalleryShootingDate = gallery?.shooting_date?.slice(0, 10) ?? '';
  const currentPublicSortBy = gallery?.public_sort_by ?? DEFAULT_PUBLIC_SORT_BY;
  const currentPublicSortOrder = gallery?.public_sort_order ?? DEFAULT_PUBLIC_SORT_ORDER;

  useEffect(() => {
    if (!gallery || isSavingShootingDate) {
      return;
    }

    if (shootingDateInput === currentGalleryShootingDate) {
      lastFailedShootingDateSaveRef.current = null;
      return;
    }

    const pendingShootingDate = shootingDateInput.trim();
    if (lastFailedShootingDateSaveRef.current === pendingShootingDate) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const isSaved = await handleSaveShootingDate(shootingDateInput);
        if (isSaved) {
          lastFailedShootingDateSaveRef.current = null;
          return;
        }

        lastFailedShootingDateSaveRef.current = pendingShootingDate;
      })();
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    gallery,
    isSavingShootingDate,
    shootingDateInput,
    currentGalleryShootingDate,
    handleSaveShootingDate,
  ]);

  useEffect(() => {
    if (!gallery || isSavingPublicSortSettings) {
      return;
    }

    if (
      publicSortByInput === currentPublicSortBy &&
      publicSortOrderInput === currentPublicSortOrder
    ) {
      lastFailedPublicSortSaveRef.current = null;
      return;
    }

    const pendingPublicSortKey = `${publicSortByInput}:${publicSortOrderInput}`;
    if (lastFailedPublicSortSaveRef.current === pendingPublicSortKey) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const isSaved = await handleSavePublicSortSettings(publicSortByInput, publicSortOrderInput);
        if (isSaved) {
          lastFailedPublicSortSaveRef.current = null;
          return;
        }

        lastFailedPublicSortSaveRef.current = pendingPublicSortKey;
      })();
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    gallery,
    isSavingPublicSortSettings,
    publicSortByInput,
    publicSortOrderInput,
    currentPublicSortBy,
    currentPublicSortOrder,
    handleSavePublicSortSettings,
  ]);

  // Drag and Drop
  const {
    isPageDragActive,
    handleGalleryDragEnter,
    handleGalleryDragOver,
    handleGalleryDragLeave,
    handleGalleryDrop,
  } = useGalleryDragAndDrop(photoUploaderRef);

  // Lightbox
  const { openLightbox, renderLightbox } = usePhotoLightbox({
    photoCardSelector: '[data-photo-card]',
    gridRef,
  });

  // Derived state
  const areAllOnPageSelected =
    photoUrls.length > 0 && photoUrls.every((p) => selection.isSelected(p.id));

  useEffect(() => {
    if (photoUrls.length === 0) {
      return;
    }

    setPhotoSizeById((prev) => {
      const next = { ...prev };
      for (const photo of photoUrls) {
        next[photo.id] = photo.file_size || 0;
      }
      return next;
    });
  }, [photoUrls]);

  const selectedSizeBytes = useMemo(() => {
    if (selection.selectedIds.size === 0) {
      return 0;
    }

    return Array.from(selection.selectedIds).reduce(
      (total, photoId) => total + (photoSizeById[photoId] || 0),
      0,
    );
  }, [photoSizeById, selection.selectedIds]);

  const photoThumbnailById = useMemo(
    () =>
      Object.fromEntries(
        photoUrls.map((photo) => [photo.id, photo.thumbnail_url] as const),
      ) as Record<string, string>,
    [photoUrls],
  );

  const favoritesCount = favoritesTabs.length;
  const favoritesSessionCount = favoritesTabs.reduce((sum, tab) => sum + tab.sessionCount, 0);
  const selectedFavoritesTab = useMemo(
    () => favoritesTabs.find((tab) => tab.key === selectedFavoritesTabKey) ?? null,
    [favoritesTabs, selectedFavoritesTabKey],
  );

  const fetchSelectionRows = useCallback(async () => {
    if (!galleryId) return;
    setIsLoadingSelectionRows(true);
    setSelectionSessionsError('');
    try {
      const rows = await shareLinkService.getGallerySelections(galleryId);
      const shareLinksById = new Map(shareLinks.map((shareLink) => [shareLink.id, shareLink]));
      const detailResponses = await Promise.all(
        rows
          .filter((row) => row.selected_count > 0)
          .map(async (row) => {
            const detail = await shareLinkService.getOwnerSelectionDetail(row.sharelink_id);
            return { row, detail };
          }),
      );

      const tabByUserKey = new Map<string, FavoritesUserTab>();
      for (const { row, detail } of detailResponses) {
        for (const session of detail.sessions) {
          if (session.selected_count <= 0) {
            continue;
          }
          const identityParts = [
            (session.client_name || '').trim().toLowerCase(),
            session.client_email?.trim().toLowerCase() || '',
            session.client_phone?.trim() || '',
          ];
          const identityKey = identityParts.some(Boolean) ? identityParts.join('|') : null;
          const userIdentityKey = identityKey ?? `${row.sharelink_id}:${session.id}`;
          const userTabKey = createFavoritesUserTabKey(userIdentityKey);
          const shareLink = shareLinksById.get(row.sharelink_id);
          const nextTab: FavoritesUserTab = {
            key: userTabKey,
            shareLinkId: row.sharelink_id,
            sessionId: session.id,
            clientName: session.client_name || 'Unnamed client',
            status: session.status,
            selectedCount: session.selected_count,
            sessionCount: 1,
            shareLinkLabel: shareLink?.label || row.sharelink_label || null,
            updatedAt: session.updated_at,
          };
          const existing = tabByUserKey.get(userIdentityKey);
          if (!existing) {
            tabByUserKey.set(userIdentityKey, nextTab);
            continue;
          }
          const isNewer = Date.parse(nextTab.updatedAt) > Date.parse(existing.updatedAt);
          tabByUserKey.set(
            userIdentityKey,
            isNewer
              ? { ...nextTab, sessionCount: existing.sessionCount + 1 }
              : { ...existing, sessionCount: existing.sessionCount + 1 },
          );
        }
      }
      const tabs = Array.from(tabByUserKey.values()).sort(
        (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
      );

      setFavoritesTabs(tabs);
      setSelectedFavoritesTabKey((current) => {
        if (current && tabs.some((tab) => tab.key === current)) return current;
        return tabs[0]?.key ?? null;
      });
    } catch (err) {
      setSelectionSessionsError(handleApiError(err).message || 'Failed to load favorites');
    } finally {
      setIsLoadingSelectionRows(false);
    }
  }, [galleryId, shareLinks]);

  const getSelectionSessionDetail = useCallback(
    async (shareLinkId: string, sessionId: string, force = false): Promise<SelectionSession> => {
      const cacheKey = createSelectionSessionCacheKey(shareLinkId, sessionId);

      if (!force) {
        const cached = selectionSessionCacheRef.current.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      const inFlight = selectionSessionInFlightRef.current.get(cacheKey);
      if (inFlight && !force) {
        return inFlight;
      }

      const request = shareLinkService
        .getOwnerSelectionSessionDetail(shareLinkId, sessionId)
        .then((detail) => {
          selectionSessionCacheRef.current.set(cacheKey, detail);
          return detail;
        })
        .finally(() => {
          selectionSessionInFlightRef.current.delete(cacheKey);
        });

      selectionSessionInFlightRef.current.set(cacheKey, request);
      return request;
    },
    [],
  );

  const fetchSelectionSessionDetail = useCallback(
    async (
      shareLinkId: string,
      sessionId: string,
      options?: { silent?: boolean; force?: boolean },
    ) => {
      const { silent = false, force = false } = options ?? {};
      const cacheKey = createSelectionSessionCacheKey(shareLinkId, sessionId);
      const cached = !force ? selectionSessionCacheRef.current.get(cacheKey) : null;

      if (cached) {
        if (!silent) {
          setSelectedFavoritesSessionDetail(cached);
          setSelectionSessionsError('');
        }
        return cached;
      }

      if (!silent) {
        setIsLoadingSelectionDetail(true);
        setSelectionSessionsError('');
      }

      try {
        const detail = await getSelectionSessionDetail(shareLinkId, sessionId, force);
        if (!silent) {
          setSelectedFavoritesSessionDetail(detail);
        }
        return detail;
      } catch (err) {
        if (!silent) {
          setSelectedFavoritesSessionDetail(null);
          setSelectionSessionsError(
            handleApiError(err).message || 'Failed to load favorites session',
          );
        }
        return null;
      } finally {
        if (!silent) {
          setIsLoadingSelectionDetail(false);
        }
      }
    },
    [getSelectionSessionDetail],
  );

  useEffect(() => {
    // Determine if this is the initial load (no gallery data yet)
    const isInitial = gallery === null;
    fetchGalleryDetails(pagination.page, isInitial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, galleryId, activeSearch, sortBy, sortOrder]);

  useEffect(() => {
    setFavoritesTabs([]);
    setSelectedFavoritesTabKey(null);
    setSelectedFavoritesSessionDetail(null);
    setSelectionSessionsError('');
    setHasLoadedFavorites(false);
    selectionSessionCacheRef.current.clear();
    selectionSessionInFlightRef.current.clear();
  }, [shareLinks]);

  useEffect(() => {
    if (activeContentTab !== 'favorites') {
      return;
    }
    if (shareLinks.length === 0 || hasLoadedFavorites || isLoadingSelectionRows) {
      return;
    }
    setHasLoadedFavorites(true);
    void fetchSelectionRows();
  }, [
    activeContentTab,
    fetchSelectionRows,
    hasLoadedFavorites,
    isLoadingSelectionRows,
    shareLinks.length,
  ]);

  useEffect(() => {
    if (activeContentTab !== 'favorites' || !selectedFavoritesTab) {
      setSelectedFavoritesSessionDetail(null);
      return;
    }
    void fetchSelectionSessionDetail(
      selectedFavoritesTab.shareLinkId,
      selectedFavoritesTab.sessionId,
    );
  }, [activeContentTab, fetchSelectionSessionDetail, selectedFavoritesTab]);

  useEffect(() => {
    if (activeContentTab !== 'favorites' || !selectedFavoritesTab || favoritesTabs.length < 2) {
      return;
    }

    const currentIndex = favoritesTabs.findIndex((tab) => tab.key === selectedFavoritesTab.key);
    if (currentIndex === -1) {
      return;
    }

    const prefetchCandidate = favoritesTabs[currentIndex + 1] ?? favoritesTabs[currentIndex - 1];
    if (!prefetchCandidate) {
      return;
    }

    void fetchSelectionSessionDetail(prefetchCandidate.shareLinkId, prefetchCandidate.sessionId, {
      silent: true,
    });
  }, [activeContentTab, favoritesTabs, fetchSelectionSessionDetail, selectedFavoritesTab]);

  const handleSelectContentTab = useCallback(
    (tab: 'project' | 'favorites') => {
      startTabTransition(() => {
        setActiveContentTab(tab);
      });
    },
    [startTabTransition],
  );

  const handleSelectFavoritesTab = useCallback(
    (key: string) => {
      startTabTransition(() => {
        setSelectedFavoritesTabKey(key);
      });
    },
    [startTabTransition],
  );

  const handleCloseSelectionSession = useCallback(async () => {
    if (!selectedFavoritesTab) return;
    setIsMutatingSelectionSession(true);
    setSelectionSessionsError('');
    try {
      await shareLinkService.closeOwnerSelectionSession(
        selectedFavoritesTab.shareLinkId,
        selectedFavoritesTab.sessionId,
      );
      await fetchSelectionRows();
      await fetchSelectionSessionDetail(
        selectedFavoritesTab.shareLinkId,
        selectedFavoritesTab.sessionId,
        { force: true },
      );
    } catch (err) {
      setSelectionSessionsError(handleApiError(err).message || 'Failed to close favorites list');
    } finally {
      setIsMutatingSelectionSession(false);
    }
  }, [fetchSelectionRows, fetchSelectionSessionDetail, selectedFavoritesTab]);

  const handleReopenSelectionSession = useCallback(async () => {
    if (!selectedFavoritesTab) return;
    setIsMutatingSelectionSession(true);
    setSelectionSessionsError('');
    try {
      await shareLinkService.reopenOwnerSelectionSession(
        selectedFavoritesTab.shareLinkId,
        selectedFavoritesTab.sessionId,
      );
      await fetchSelectionRows();
      await fetchSelectionSessionDetail(
        selectedFavoritesTab.shareLinkId,
        selectedFavoritesTab.sessionId,
        { force: true },
      );
    } catch (err) {
      setSelectionSessionsError(handleApiError(err).message || 'Failed to reopen favorites list');
    } finally {
      setIsMutatingSelectionSession(false);
    }
  }, [fetchSelectionRows, fetchSelectionSessionDetail, selectedFavoritesTab]);

  useEffect(() => {
    if (!isInitialLoading) {
      setShowInitialLoadingState(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowInitialLoadingState(true);
    }, 220);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isInitialLoading]);

  // Handler for toggling photo selection
  const handleTogglePhotoSelection = (photoId: string, isShiftKey: boolean = false) => {
    if (isShiftKey) {
      const photoIds = photoUrls.map((p) => p.id);
      selection.selectRange(photoId, photoIds);
    } else {
      selection.toggle(photoId);
    }
  };

  // Handler for selecting all photos on current page
  const handleSelectAllPhotos = useCallback(() => {
    if (areAllOnPageSelected) {
      const pagePhotoIds = photoUrls.map((p) => p.id);
      pagePhotoIds.forEach((id) => selection.deselect(id));
    } else {
      selection.selectMultiple(photoUrls.map((p) => p.id));
    }
  }, [areAllOnPageSelected, photoUrls, selection]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isTypingTarget =
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        Boolean(target?.isContentEditable);

      const searchElement = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null;
      const isSearchFocused = searchElement === document.activeElement;

      if (
        !isTypingTarget &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key === '/'
      ) {
        event.preventDefault();
        searchElement?.focus();
        searchElement?.select();
        return;
      }

      if (
        !isTypingTarget &&
        event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'f'
      ) {
        event.preventDefault();
        window.dispatchEvent(new Event('gallery:open-public-sort'));
        return;
      }

      if (event.key === 'Escape' && !isSelectionMode && searchInput.trim().length > 0) {
        if (!isTypingTarget || isSearchFocused) {
          event.preventDefault();
          setSearchInput('');
          updateFilterQueryParams({ search: null, resetPage: true });
          if (isSearchFocused) {
            searchElement?.blur();
          }
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [isSelectionMode, searchInput, updateFilterQueryParams]);

  useEffect(() => {
    if (!isSelectionMode) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isTypingTarget =
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        Boolean(target?.isContentEditable);

      if (isTypingTarget) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        selection.clear();
        setIsSelectionMode(false);
        return;
      }

      const isSelectAllShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'a';

      if (isSelectAllShortcut) {
        event.preventDefault();
        handleSelectAllPhotos();
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [isSelectionMode, handleSelectAllPhotos, selection]);

  // Handler for deleting multiple photos
  const handleDeleteMultiplePhotosWrapper = () => {
    handleDeletePhotos(selection.selectedIds, () => {
      selection.clear();
      setIsSelectionMode(false);
    });
  };

  const handleDownloadSelectedPhotosWrapper = () => {
    void handleDownloadSelectedPhotos(selection.selectedIds);
  };

  // Photo modal handlers
  const openPhoto = (index: number) => {
    if (!isSelectionMode) {
      openLightbox(index);
    } else {
      // In selection mode, clicking a photo toggles selection
      const photo = photoUrls[index];
      if (photo) {
        handleTogglePhotoSelection(photo.id);
      }
    }
  };

  if (isInitialLoading && showInitialLoadingState) {
    return <GalleryInitialLoadingState />;
  }

  if (isInitialLoading) {
    return null;
  }

  if (error && !gallery) {
    return (
      <GalleryLoadErrorState
        error={error}
        onRetry={() => fetchGalleryDetails(pagination.page, true)}
      />
    );
  }

  if (!gallery) {
    return <GalleryNotFoundState />;
  }

  return (
    <div
      className="relative min-h-screen pb-20"
      onDragEnter={isModalOpen ? undefined : handleGalleryDragEnter}
      onDragOver={isModalOpen ? undefined : handleGalleryDragOver}
      onDragLeave={isModalOpen ? undefined : handleGalleryDragLeave}
      onDrop={isModalOpen ? undefined : handleGalleryDrop}
      aria-label={isSelectionMode ? 'Selection mode active' : undefined}
    >
      <GalleryDragOverlay isActive={isPageDragActive} />

      <div className="space-y-8">
        {/* Gallery Header */}
        <GalleryHeader
          gallery={gallery}
          visiblePhotoCount={photoUrls.length}
          totalPhotoCount={pagination.total}
          isLoadingPhotos={isLoadingPhotos}
          shootingDateInput={shootingDateInput}
          onShootingDateChange={setShootingDateInput}
          isSavingShootingDate={isSavingShootingDate}
          publicSortBy={publicSortByInput}
          publicSortOrder={publicSortOrderInput}
          onPublicSortChange={({
            sortBy: nextSortBy,
            sortOrder: nextSortOrder,
          }: {
            sortBy: GalleryPhotoSortBy;
            sortOrder: SortOrder;
          }) => {
            setPublicSortByInput(nextSortBy);
            setPublicSortOrderInput(nextSortOrder);
          }}
          isSavingPublicSortSettings={isSavingPublicSortSettings}
          searchValue={searchInput}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onDeleteGallery={handleDeleteGallery}
          onSearchChange={setSearchInput}
          onSortChange={({
            sortBy: nextSortBy,
            sortOrder: nextSortOrder,
          }: {
            sortBy: GalleryPhotoSortBy;
            sortOrder: SortOrder;
          }) => {
            updateFilterQueryParams({
              sortBy: nextSortBy,
              order: nextSortOrder,
              resetPage: true,
            });
          }}
        />

        <div
          role="tablist"
          aria-label="Gallery sections"
          className="flex items-center gap-2 overflow-x-auto"
        >
          <button
            id="gallery-content-tab-project"
            role="tab"
            aria-selected={activeContentTab === 'project'}
            aria-controls="gallery-content-panel-project"
            type="button"
            onClick={() => handleSelectContentTab('project')}
            className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold ${
              activeContentTab === 'project'
                ? 'border-accent/45 bg-accent/10 text-accent'
                : 'border-border/50 bg-surface text-text hover:border-accent/30'
            }`}
          >
            Project
          </button>
          <button
            id="gallery-content-tab-favorites"
            role="tab"
            aria-selected={activeContentTab === 'favorites'}
            aria-controls="gallery-content-panel-favorites"
            type="button"
            onClick={() => handleSelectContentTab('favorites')}
            className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold ${
              activeContentTab === 'favorites'
                ? 'border-accent/45 bg-accent/10 text-accent'
                : 'border-border/50 bg-surface text-text hover:border-accent/30'
            }`}
          >
            Favorites ({hasLoadedFavorites ? favoritesSessionCount : favoritesCount})
          </button>
        </div>

        {activeContentTab === 'project' ? (
          <div
            id="gallery-content-panel-project"
            role="tabpanel"
            aria-labelledby="gallery-content-tab-project"
          >
            <div className="space-y-8">
              <GalleryPhotoSection
                galleryId={galleryId}
                pagination={pagination}
                gridRef={gridRef}
                photoUploaderRef={photoUploaderRef}
                onModalStateChange={setIsModalOpen}
                state={{
                  photoUrls,
                  gallerySizeBytes: gallery.total_size_bytes ?? 0,
                  isLoadingPhotos,
                  activeSearchTerm: activeSearch || undefined,
                  uploadError,
                  actionInfo,
                  error,
                  isSelectionMode,
                  isDownloadingZip,
                }}
                selection={{
                  areAllOnPageSelected,
                  selectionCount: selection.count,
                  selectedSizeBytes,
                  hasSelection: selection.hasSelection,
                  isPhotoSelected: (id: string) => selection.isSelected(id),
                  isCoverPhoto: (photoId: string | null | undefined) =>
                    gallery.cover_photo_id === photoId,
                }}
                actions={{
                  onUploadComplete: handleUploadComplete,
                  onDismissUploadError: () => setUploadError(''),
                  onDismissActionInfo: () => setActionInfo(''),
                  onDismissError: clearError,
                  onToggleSelectionMode: () => {
                    if (isSelectionMode) {
                      selection.clear();
                      setIsSelectionMode(false);
                    } else {
                      setIsSelectionMode(true);
                    }
                  },
                  onTogglePhotoSelection: handleTogglePhotoSelection,
                  onOpenPhoto: openPhoto,
                  onSetCover: handleSetCover,
                  onClearCover: handleClearCover,
                  onRenamePhoto: handleRenamePhoto,
                  onDeletePhoto: handleDeletePhoto,
                  onDownloadGallery: handleDownloadGallery,
                  onDownloadSelectedPhotos: handleDownloadSelectedPhotosWrapper,
                  onClearSearch: () => {
                    setSearchInput('');
                    updateFilterQueryParams({ search: null, resetPage: true });
                  },
                  onSelectAllPhotos: handleSelectAllPhotos,
                  onCancelSelection: () => {
                    selection.clear();
                    setIsSelectionMode(false);
                  },
                  onDeleteMultiplePhotos: handleDeleteMultiplePhotosWrapper,
                }}
              />

              <ShareLinksSection
                shareLinks={shareLinks}
                isLoading={isLoadingShareLinks}
                error={shareLinksError}
                onRetry={fetchShareLinks}
                isCreatingLink={isCreatingLink}
                onCreateLink={handleCreateShareLink}
                onEditLink={(link) => setEditingShareLink(link)}
                onOpenLinkAnalytics={(linkId) => navigate(`/share-links/${linkId}`)}
                onOpenDashboard={() => navigate('/share-links')}
                onDeleteLink={handleDeleteShareLink}
              />
            </div>
          </div>
        ) : (
          <div
            id="gallery-content-panel-favorites"
            role="tabpanel"
            aria-labelledby="gallery-content-tab-favorites"
          >
            <GallerySelectionSessionsPanel
              userTabs={favoritesTabs}
              selectedUserTabKey={selectedFavoritesTabKey}
              selectedSession={selectedFavoritesSessionDetail}
              thumbnailByPhotoId={photoThumbnailById}
              isLoadingRows={isLoadingSelectionRows}
              isLoadingDetail={isLoadingSelectionDetail}
              isMutating={isMutatingSelectionSession}
              error={selectionSessionsError}
              onSelectUserTab={handleSelectFavoritesTab}
              onCloseSession={() => {
                void handleCloseSelectionSession();
              }}
              onReopenSession={() => {
                void handleReopenSelectionSession();
              }}
              onRefresh={() => {
                void fetchSelectionRows();
              }}
            />
          </div>
        )}
      </div>

      {/* Lightbox */}
      {renderLightbox(
        photoUrls.map((photo) => ({
          src: photo.url,
          thumbnailSrc: photo.thumbnail_url,
          alt: photo.filename,
          width: photo.width ?? undefined,
          height: photo.height ?? undefined,
          download: photo.url,
          downloadFilename: photo.filename,
        })),
        pagination.total,
      )}

      {/* Photo Rename Modal */}
      <AnimatePresence>
        {renameModal.isOpen && (
          <PhotoRenameModal
            isOpen={renameModal.isOpen}
            onClose={renameModal.close}
            currentFilename={renameModal.data?.filename || ''}
            onRename={handleRenameConfirm}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingShareLink ? (
          <ShareLinkEditorModal
            isOpen={Boolean(editingShareLink)}
            link={editingShareLink}
            onClose={() => setEditingShareLink(null)}
            onSave={(payload) => handleUpdateShareLink(editingShareLink.id, payload)}
          />
        ) : null}
      </AnimatePresence>

      {/* Confirmation Modal */}
      {ConfirmModal}
    </div>
  );
};
