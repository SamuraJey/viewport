import { Loader2, Lock, LockOpen } from 'lucide-react';
import type { SelectionSession } from '../../types';

interface FavoritesUserTab {
  key: string;
  clientName: string;
  status: string;
  selectedCount: number;
  shareLinkLabel: string | null;
}

interface GallerySelectionSessionsPanelProps {
  userTabs: FavoritesUserTab[];
  selectedUserTabKey: string | null;
  selectedSession: SelectionSession | null;
  thumbnailByPhotoId: Record<string, string>;
  isLoadingRows: boolean;
  isLoadingDetail: boolean;
  isMutating: boolean;
  error: string;
  onSelectUserTab: (key: string) => void;
  onCloseSession: () => void;
  onReopenSession: () => void;
  onRefresh: () => void;
}

export const GallerySelectionSessionsPanel = ({
  userTabs,
  selectedUserTabKey,
  selectedSession,
  thumbnailByPhotoId,
  isLoadingRows,
  isLoadingDetail,
  isMutating,
  error,
  onSelectUserTab,
  onCloseSession,
  onReopenSession,
  onRefresh,
}: GallerySelectionSessionsPanelProps) => {
  const activeUserTab = userTabs.find((userTab) => userTab.key === selectedUserTabKey) ?? null;

  return (
    <section className="rounded-3xl border border-border/50 bg-surface p-6 shadow-xs">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-text">Favorites</h2>
          <p className="text-sm text-muted">Selected photos grouped by client in separate tabs.</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-xs font-semibold text-text hover:border-accent/40"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="space-y-4">
        <div
          role="tablist"
          aria-label="Favorite lists by client"
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {isLoadingRows ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading favorite lists...
            </div>
          ) : userTabs.length ? (
            userTabs.map((userTab) => {
              const isActive = selectedUserTabKey === userTab.key;
              return (
                <button
                  key={userTab.key}
                  id={`favorite-tab-${userTab.key}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`favorite-panel-${userTab.key}`}
                  type="button"
                  onClick={() => onSelectUserTab(userTab.key)}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-left ${
                    isActive
                      ? 'border-accent/45 bg-accent/10'
                      : 'border-border/50 bg-surface-1 hover:border-accent/30'
                  }`}
                >
                  <p className="text-sm font-semibold text-text">{userTab.clientName}</p>
                  <p className="text-xs text-muted">
                    {userTab.selectedCount} selected • {userTab.status}
                  </p>
                </button>
              );
            })
          ) : (
            <div className="rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm text-muted">
              No favorites yet.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border/50 bg-surface-1 p-4">
          {isLoadingDetail ? (
            <div className="text-sm text-muted">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading selected list...
              </span>
            </div>
          ) : activeUserTab && selectedSession ? (
            <div
              id={`favorite-panel-${activeUserTab.key}`}
              role="tabpanel"
              aria-labelledby={`favorite-tab-${activeUserTab.key}`}
              className="space-y-4"
            >
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-border/40 bg-surface px-3 py-2">
                  <p className="text-xs text-muted">Client</p>
                  <p className="font-semibold text-text">{activeUserTab.clientName}</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-surface px-3 py-2">
                  <p className="text-xs text-muted">Selected photos</p>
                  <p className="font-semibold text-text">{activeUserTab.selectedCount}</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-surface px-3 py-2">
                  <p className="text-xs text-muted">Share link</p>
                  <p className="font-semibold text-text">
                    {activeUserTab.shareLinkLabel || 'Untitled link'}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border/40 bg-surface px-3 py-2">
                {selectedSession.status === 'closed' ? (
                  <button
                    type="button"
                    onClick={onReopenSession}
                    disabled={isMutating}
                    className="inline-flex items-center gap-1 rounded-lg border border-success/40 bg-success/10 px-2 py-1 text-xs font-semibold text-success disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <LockOpen className="h-3 w-3" />
                    Reopen list
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onCloseSession}
                    disabled={isMutating}
                    className="inline-flex items-center gap-1 rounded-lg border border-danger/40 bg-danger/10 px-2 py-1 text-xs font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Lock className="h-3 w-3" />
                    Close list
                  </button>
                )}
              </div>

              <div className="rounded-xl border border-border/40 bg-surface p-3">
                <h3 className="text-sm font-semibold text-text">Selected photos</h3>
                {selectedSession.items.length ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {selectedSession.items.map((item) => (
                      <div
                        key={item.photo_id}
                        className="rounded-lg border border-border/40 bg-surface-1 p-2"
                      >
                        {thumbnailByPhotoId[item.photo_id] ? (
                          <img
                            src={thumbnailByPhotoId[item.photo_id]}
                            alt={item.photo_display_name || item.photo_id}
                            className="h-20 w-full rounded-md object-cover"
                          />
                        ) : null}
                        <p className="mt-2 text-xs font-semibold text-text">
                          {item.photo_display_name || item.photo_id}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {new Date(item.selected_at).toLocaleString()}
                        </p>
                        {item.comment ? (
                          <p className="mt-1 text-xs text-muted">{item.comment}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">No selected photos in the active list.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Pick a client tab to inspect favorites.</p>
          )}
        </div>
      </div>
    </section>
  );
};
