import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { LayoutGrid, List, Loader2, Lock, LockOpen } from 'lucide-react';
import { PaginationControls } from '../PaginationControls';
import type { SelectionItem, SelectionSession } from '../../types';
import { AppTabs } from '../ui';

interface FavoritesUserTab {
  key: string;
  clientName: string;
  status: string;
  selectedCount: number;
  sessionCount: number;
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

const RECENT_SELECTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const getFavoriteTabDomId = (key: string): string => `favorite-tab-${encodeURIComponent(key)}`;
const getFavoritePanelDomId = (key: string): string => `favorite-panel-${encodeURIComponent(key)}`;

interface FavoriteSelectionItemProps {
  item: SelectionItem;
  thumbnailSrc: string | null;
}

const FavoriteSelectionGridItem = memo(({ item, thumbnailSrc }: FavoriteSelectionItemProps) => (
  <article className="overflow-hidden rounded-lg border border-border/40 bg-surface-1">
    <div className="aspect-[4/3] overflow-hidden bg-surface">
      {thumbnailSrc ? (
        <img
          src={thumbnailSrc}
          alt={item.photo_display_name || item.photo_id}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs font-medium text-muted">
          No preview
        </div>
      )}
    </div>
    <div className="space-y-1 p-2.5">
      <p className="truncate text-sm font-semibold text-text">
        {item.photo_display_name || item.photo_id}
      </p>
      <p className="text-xs text-muted">Selected: {new Date(item.selected_at).toLocaleString()}</p>
      {item.comment ? <p className="line-clamp-2 text-xs text-muted">{item.comment}</p> : null}
    </div>
  </article>
));

FavoriteSelectionGridItem.displayName = 'FavoriteSelectionGridItem';

const FavoriteSelectionListItem = memo(({ item, thumbnailSrc }: FavoriteSelectionItemProps) => (
  <article className="flex items-center gap-3 rounded-lg border border-border/40 bg-surface-1 p-2">
    <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md bg-surface">
      {thumbnailSrc ? (
        <img
          src={thumbnailSrc}
          alt={item.photo_display_name || item.photo_id}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-[11px] font-medium text-muted">
          No preview
        </div>
      )}
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold text-text">
        {item.photo_display_name || item.photo_id}
      </p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <span>Selected: {new Date(item.selected_at).toLocaleString()}</span>
        <span>Updated: {new Date(item.updated_at).toLocaleString()}</span>
        <span className="font-mono">ID: {item.photo_id}</span>
      </div>
      {item.comment ? <p className="mt-1 truncate text-xs text-muted">{item.comment}</p> : null}
    </div>
  </article>
));

FavoriteSelectionListItem.displayName = 'FavoriteSelectionListItem';

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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [tabFilter, setTabFilter] = useState<'all' | 'active'>('all');
  const [itemSearch, setItemSearch] = useState('');
  const [commentsOnly, setCommentsOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const [page, setPage] = useState(1);
  const deferredItemSearch = useDeferredValue(itemSearch);

  const visibleUserTabs = useMemo(() => {
    if (tabFilter !== 'active') {
      return userTabs;
    }
    return userTabs.filter(
      (userTab) => userTab.status !== 'closed' || userTab.key === selectedUserTabKey,
    );
  }, [selectedUserTabKey, tabFilter, userTabs]);

  const activeUserTab = userTabs.find((userTab) => userTab.key === selectedUserTabKey) ?? null;
  const activeVisibleTab =
    visibleUserTabs.find((userTab) => userTab.key === selectedUserTabKey) ??
    visibleUserTabs[0] ??
    null;
  const activeVisibleTabKey = activeVisibleTab?.key ?? null;
  const totalSessions = useMemo(
    () => userTabs.reduce((sum, userTab) => sum + userTab.sessionCount, 0),
    [userTabs],
  );
  const totalSelectedPhotos = useMemo(
    () => userTabs.reduce((sum, userTab) => sum + userTab.selectedCount, 0),
    [userTabs],
  );
  const pageSize = viewMode === 'grid' ? 12 : 15;
  const filteredSessionItems = useMemo(() => {
    if (!selectedSession) {
      return [];
    }

    const query = deferredItemSearch.trim().toLowerCase();
    const now = Date.now();

    const matches = selectedSession.items.filter((item) => {
      if (commentsOnly && !(item.comment && item.comment.trim().length > 0)) {
        return false;
      }

      if (recentOnly && now - Date.parse(item.selected_at) > RECENT_SELECTION_WINDOW_MS) {
        return false;
      }

      if (!query) {
        return true;
      }

      const candidate =
        `${item.photo_display_name || ''} ${item.photo_id} ${item.comment || ''}`.toLowerCase();
      return candidate.includes(query);
    });

    if (recentOnly) {
      return [...matches].sort((a, b) => Date.parse(b.selected_at) - Date.parse(a.selected_at));
    }

    return matches;
  }, [commentsOnly, deferredItemSearch, recentOnly, selectedSession]);
  const totalItems = filteredSessionItems.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const pagedItems = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filteredSessionItems.slice(startIndex, startIndex + pageSize);
  }, [filteredSessionItems, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [selectedSession?.id, viewMode, commentsOnly, recentOnly, deferredItemSearch]);

  useEffect(() => {
    if (totalPages === 0) {
      if (page !== 1) {
        setPage(1);
      }
      return;
    }

    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (activeVisibleTabKey && activeVisibleTabKey !== selectedUserTabKey) {
      onSelectUserTab(activeVisibleTabKey);
    }
  }, [activeVisibleTabKey, onSelectUserTab, selectedUserTabKey]);

  const selectionPagination = {
    page,
    pageSize,
    total: totalItems,
    totalPages,
    isFirstPage: page <= 1,
    isLastPage: totalPages > 0 && page >= totalPages,
    nextPage: () => setPage((current) => Math.min(totalPages || 1, current + 1)),
    previousPage: () => setPage((current) => Math.max(1, current - 1)),
    goToPage: (targetPage: number) => {
      if (totalPages === 0) {
        setPage(1);
        return;
      }
      setPage(Math.max(1, Math.min(targetPage, totalPages)));
    },
  };

  const selectedSessionPanel = isLoadingDetail ? (
    <div className="text-sm text-muted">
      <span className="inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading selected list...
      </span>
    </div>
  ) : activeUserTab && selectedSession ? (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-border/40 bg-surface px-3 py-2">
          <p className="text-xs text-muted">Client</p>
          <p className="font-semibold text-text">{activeUserTab.clientName}</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-surface px-3 py-2">
          <p className="text-xs text-muted">Selected photos</p>
          <p className="font-semibold text-text">{activeUserTab.selectedCount}</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-surface px-3 py-2">
          <p className="text-xs text-muted">Sessions</p>
          <p className="font-semibold text-text">{activeUserTab.sessionCount}</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-surface px-3 py-2">
          <p className="text-xs text-muted">Share link</p>
          <p className="font-semibold text-text">
            {activeUserTab.shareLinkLabel || 'Untitled link'}
          </p>
        </div>
      </div>

      <div className="sticky top-4 z-10 rounded-xl border border-border/40 bg-surface px-3 py-2 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border/40 bg-surface-1 px-2 py-1 text-xs font-semibold text-text">
              Showing {totalItems} / {selectedSession.items.length}
            </span>
            <button
              type="button"
              onClick={() => setTabFilter((current) => (current === 'active' ? 'all' : 'active'))}
              className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                tabFilter === 'active'
                  ? 'border-accent/45 bg-accent/10 text-accent'
                  : 'border-border/40 bg-surface-1 text-text'
              }`}
            >
              Only active sessions
            </button>
            <button
              type="button"
              onClick={() => setCommentsOnly((current) => !current)}
              className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                commentsOnly
                  ? 'border-accent/45 bg-accent/10 text-accent'
                  : 'border-border/40 bg-surface-1 text-text'
              }`}
            >
              With comments
            </button>
            <button
              type="button"
              onClick={() => setRecentOnly((current) => !current)}
              className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                recentOnly
                  ? 'border-accent/45 bg-accent/10 text-accent'
                  : 'border-border/40 bg-surface-1 text-text'
              }`}
            >
              Recent (7d)
            </button>
          </div>
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
      </div>

      <div className="rounded-xl border border-border/40 bg-surface p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-text">Selected photos</h3>
          <input
            type="search"
            value={itemSearch}
            onChange={(event) => setItemSearch(event.target.value)}
            placeholder="Search by filename, id, comment"
            className="h-9 w-full rounded-lg border border-border/50 bg-surface-1 px-3 text-xs text-text placeholder:text-muted sm:w-72"
          />
          <div className="inline-flex items-center gap-1 rounded-lg border border-border/40 bg-surface-1 p-1">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                viewMode === 'grid'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-text hover:bg-surface'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                viewMode === 'list'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-text hover:bg-surface'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
          </div>
        </div>
        {totalItems ? (
          viewMode === 'grid' ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pagedItems.map((item) => (
                <FavoriteSelectionGridItem
                  key={item.photo_id}
                  item={item}
                  thumbnailSrc={
                    thumbnailByPhotoId[item.photo_id] || item.photo_thumbnail_url || null
                  }
                />
              ))}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {pagedItems.map((item) => (
                <FavoriteSelectionListItem
                  key={item.photo_id}
                  item={item}
                  thumbnailSrc={
                    thumbnailByPhotoId[item.photo_id] || item.photo_thumbnail_url || null
                  }
                />
              ))}
            </div>
          )
        ) : (
          <p className="mt-2 text-sm text-muted">
            No selected photos match current filters in the active list.
          </p>
        )}

        {selectionPagination.totalPages > 1 ? (
          <div className="mt-4 border-t border-border/40 pt-2">
            <PaginationControls pagination={selectionPagination} />
          </div>
        ) : null}
      </div>
    </div>
  ) : (
    <p className="text-sm text-muted">Pick a client tab to inspect favorites.</p>
  );

  const tabItems = visibleUserTabs.map((userTab) => ({
    key: userTab.key,
    tabId: getFavoriteTabDomId(userTab.key),
    panelId: getFavoritePanelDomId(userTab.key),
    tabClassName: ({ selected }: { selected: boolean }) =>
      `shrink-0 rounded-xl border px-3 py-2 text-left ${
        selected
          ? 'border-accent/45 bg-accent/10'
          : 'border-border/50 bg-surface-1 hover:border-accent/30'
      }`,
    tab: (
      <>
        <p className="text-sm font-semibold text-text">{userTab.clientName}</p>
        <p className="text-xs text-muted">
          {userTab.selectedCount} selected • {userTab.sessionCount} sessions • {userTab.status}
        </p>
      </>
    ),
    panel: userTab.key === activeVisibleTabKey ? selectedSessionPanel : <div className="hidden" />,
    panelClassName: 'rounded-2xl border border-border/50 bg-surface-1 p-4',
  }));

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

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border/40 bg-surface-1 px-3 py-2">
          <p className="text-xs text-muted">Clients</p>
          <p className="font-semibold text-text">{userTabs.length}</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-surface-1 px-3 py-2">
          <p className="text-xs text-muted">Sessions</p>
          <p className="font-semibold text-text">{totalSessions}</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-surface-1 px-3 py-2">
          <p className="text-xs text-muted">Selected photos</p>
          <p className="font-semibold text-text">{totalSelectedPhotos}</p>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="pb-1">
          {isLoadingRows ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading favorite lists...
            </div>
          ) : visibleUserTabs.length ? (
            <AppTabs
              items={tabItems}
              selectedKey={activeVisibleTabKey ?? visibleUserTabs[0].key}
              onChange={onSelectUserTab}
              listClassName="flex gap-2 overflow-x-auto"
            />
          ) : (
            <div className="rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm text-muted">
              No favorites yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
