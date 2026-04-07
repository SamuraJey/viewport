import { useCallback, useEffect, useMemo, useState } from 'react';
import { handleApiError } from '../lib/errorHandling';
import { shareLinkService } from '../services/shareLinkService';
import type { SelectionConfig, SelectionSession, SelectionSessionStartRequest } from '../types';

const getResumeStorageKey = (shareId: string) => `viewport-selection-resume-${shareId}`;

const getResumeCookieString = (shareId: string) => `${getResumeStorageKey(shareId)}=`;

const clearStoredResumeCookie = (shareId: string): void => {
  if (typeof document === 'undefined') return;

  const secureAttribute =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${getResumeCookieString(
    shareId,
  )}; Path=/s/${shareId}; Max-Age=0; SameSite=Lax${secureAttribute}`;
};

const getStoredResumeToken = (shareId: string): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage.getItem(getResumeStorageKey(shareId)) ?? undefined;
};

const setStoredResumeToken = (shareId: string, token?: string | null): void => {
  if (typeof window === 'undefined') return;
  const key = getResumeStorageKey(shareId);
  if (token && token.trim().length > 0) {
    window.localStorage.setItem(key, token.trim());
  } else {
    window.localStorage.removeItem(key);
    clearStoredResumeCookie(shareId);
  }
};

interface UsePublicSelectionProps {
  shareId: string | undefined;
  initialResumeToken?: string;
}

export const usePublicSelection = ({ shareId, initialResumeToken }: UsePublicSelectionProps) => {
  const [config, setConfig] = useState<SelectionConfig | null>(null);
  const [session, setSession] = useState<SelectionSession | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState('');
  const [showStartModal, setShowStartModal] = useState(false);
  const [pendingPhotoToToggle, setPendingPhotoToToggle] = useState<string | null>(null);
  const [selectedOnly, setSelectedOnly] = useState(false);

  const selectedIds = useMemo(
    () => new Set((session?.items ?? []).map((item) => item.photo_id)),
    [session?.items],
  );

  const canMutateSession = session?.status === 'in_progress';

  const persistResumeToken = useCallback(
    (nextSession: SelectionSession | null) => {
      if (!shareId) return;
      if (nextSession?.resume_token) {
        setStoredResumeToken(shareId, nextSession.resume_token);
      }
    },
    [shareId],
  );

  const resolveResumeToken = useCallback(() => {
    if (!shareId) return undefined;

    const routeToken = initialResumeToken?.trim();
    if (routeToken) {
      return routeToken;
    }

    return getStoredResumeToken(shareId);
  }, [initialResumeToken, shareId]);

  const loadSession = useCallback(
    async (resumeToken?: string) => {
      if (!shareId) return null;
      setIsLoadingSession(true);
      try {
        const loaded = await shareLinkService.getPublicSelectionSession(shareId, resumeToken);
        setSession(loaded);
        persistResumeToken(loaded);
        return loaded;
      } catch (err) {
        const apiError = handleApiError(err);
        if (apiError.statusCode === 404) {
          setStoredResumeToken(shareId, null);
          setSession(null);
          return null;
        }
        throw err;
      } finally {
        setIsLoadingSession(false);
      }
    },
    [persistResumeToken, shareId],
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!shareId) {
        setConfig(null);
        setSession(null);
        return;
      }

      setError('');
      setIsLoadingConfig(true);
      try {
        const loadedConfig = await shareLinkService.getPublicSelectionConfig(shareId);
        if (cancelled) return;
        setConfig(loadedConfig);

        const token = resolveResumeToken();
        if (token) {
          await loadSession(token);
        } else {
          setSession(null);
        }
      } catch (err) {
        const apiError = handleApiError(err);
        if (cancelled) return;
        if (apiError.statusCode === 404) {
          setConfig(null);
          setSession(null);
          return;
        }
        setError(apiError.message || 'Failed to load selection settings');
      } finally {
        if (!cancelled) {
          setIsLoadingConfig(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [loadSession, resolveResumeToken, shareId]);

  const refreshSession = useCallback(async () => {
    if (!shareId) return;
    const token = resolveResumeToken();
    if (!token) {
      setSession(null);
      return;
    }

    try {
      await loadSession(token);
    } catch (err) {
      const apiError = handleApiError(err);
      setError(apiError.message || 'Failed to refresh selection');
    }
  }, [loadSession, resolveResumeToken, shareId]);

  const clearSession = useCallback(() => {
    if (!shareId) return;
    setStoredResumeToken(shareId, null);
    setSession(null);
    setPendingPhotoToToggle(null);
    setError('');
    setShowStartModal(false);
  }, [shareId]);

  const startNewSession = useCallback(() => {
    clearSession();
    setShowStartModal(true);
  }, [clearSession]);

  const startSession = useCallback(
    async (payload: SelectionSessionStartRequest) => {
      if (!shareId) return;
      setIsMutating(true);
      setError('');

      try {
        const created = await shareLinkService.startPublicSelectionSession(shareId, payload);
        setSession(created);
        persistResumeToken(created);
        setShowStartModal(false);

        if (pendingPhotoToToggle) {
          await shareLinkService.togglePublicSelectionItem(
            shareId,
            pendingPhotoToToggle,
            created.resume_token ?? undefined,
          );
          await refreshSession();
          setPendingPhotoToToggle(null);
        }
        return created;
      } catch (err) {
        const apiError = handleApiError(err);
        setError(apiError.message || 'Failed to start selection session');
        throw err;
      } finally {
        setIsMutating(false);
      }
    },
    [pendingPhotoToToggle, persistResumeToken, refreshSession, shareId],
  );

  const togglePhoto = useCallback(
    async (photoId: string) => {
      if (!shareId || !config?.is_enabled) return;

      if (!session) {
        setPendingPhotoToToggle(photoId);
        setShowStartModal(true);
        return;
      }

      if (!canMutateSession) {
        setError(
          session.status === 'closed'
            ? 'Selection is closed by photographer'
            : 'Selection is already submitted',
        );
        return;
      }

      setIsMutating(true);
      setError('');
      try {
        await shareLinkService.togglePublicSelectionItem(
          shareId,
          photoId,
          session.resume_token ?? undefined,
        );
        await refreshSession();
      } catch (err) {
        const apiError = handleApiError(err);
        setError(apiError.message || 'Failed to update selected photos');
      } finally {
        setIsMutating(false);
      }
    },
    [canMutateSession, config?.is_enabled, refreshSession, session, shareId],
  );

  const updatePhotoComment = useCallback(
    async (photoId: string, comment: string) => {
      if (!shareId || !session) return;
      setIsMutating(true);
      setError('');
      try {
        const updated = await shareLinkService.updatePublicSelectionItemComment(
          shareId,
          photoId,
          { comment: comment || null },
          session.resume_token ?? undefined,
        );
        setSession((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.photo_id === photoId ? { ...item, ...updated } : item,
            ),
            updated_at: updated.updated_at,
            last_activity_at: updated.updated_at,
          };
        });
      } catch (err) {
        const apiError = handleApiError(err);
        setError(apiError.message || 'Failed to update photo comment');
      } finally {
        setIsMutating(false);
      }
    },
    [session, shareId],
  );

  const updateClientNote = useCallback(
    async (note: string) => {
      if (!shareId || !session) return;
      setIsMutating(true);
      setError('');
      try {
        const updated = await shareLinkService.updatePublicSelectionSession(
          shareId,
          { client_note: note || null },
          session.resume_token ?? undefined,
        );
        setSession(updated);
        persistResumeToken(updated);
      } catch (err) {
        const apiError = handleApiError(err);
        setError(apiError.message || 'Failed to update note');
      } finally {
        setIsMutating(false);
      }
    },
    [persistResumeToken, session, shareId],
  );

  const submitSelection = useCallback(async () => {
    if (!shareId || !session) return;
    setIsMutating(true);
    setError('');
    try {
      await shareLinkService.submitPublicSelectionSession(
        shareId,
        session.resume_token ?? undefined,
      );
      await refreshSession();
    } catch (err) {
      const apiError = handleApiError(err);
      setError(apiError.message || 'Failed to submit selection');
    } finally {
      setIsMutating(false);
    }
  }, [refreshSession, session, shareId]);

  const commentsByPhotoId = useMemo(() => {
    const entries = (session?.items ?? []).map((item) => [item.photo_id, item.comment]) as Array<
      [string, string | null]
    >;
    return Object.fromEntries(entries);
  }, [session?.items]);

  return {
    config,
    session,
    selectedIds,
    commentsByPhotoId,
    selectedOnly,
    setSelectedOnly,
    canMutateSession,
    isLoadingConfig,
    isLoadingSession,
    isMutating,
    error,
    clearError: () => setError(''),
    showStartModal,
    openStartModal: () => setShowStartModal(true),
    closeStartModal: () => {
      setShowStartModal(false);
      setPendingPhotoToToggle(null);
    },
    clearSession,
    startNewSession,
    refreshSession,
    startSession,
    togglePhoto,
    updatePhotoComment,
    updateClientNote,
    submitSelection,
  };
};
