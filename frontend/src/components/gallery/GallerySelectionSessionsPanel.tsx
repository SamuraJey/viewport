import { Loader2, Lock, LockOpen } from 'lucide-react';
import type {
  OwnerSelectionDetail,
  OwnerSelectionRow,
  SelectionSession,
  ShareLink,
} from '../../types';

interface GallerySelectionSessionsPanelProps {
  shareLinks: ShareLink[];
  rows: OwnerSelectionRow[];
  selectedShareLinkId: string | null;
  selectedSessionId: string | null;
  detail: OwnerSelectionDetail | null;
  sessionDetail: SelectionSession | null;
  thumbnailByPhotoId: Record<string, string>;
  isLoadingRows: boolean;
  isLoadingDetail: boolean;
  isMutating: boolean;
  error: string;
  onSelectShareLink: (shareLinkId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onReopenSession: (sessionId: string) => void;
  onRefresh: () => void;
}

export const GallerySelectionSessionsPanel = ({
  shareLinks,
  rows,
  selectedShareLinkId,
  selectedSessionId,
  detail,
  sessionDetail,
  thumbnailByPhotoId,
  isLoadingRows,
  isLoadingDetail,
  isMutating,
  error,
  onSelectShareLink,
  onSelectSession,
  onCloseSession,
  onReopenSession,
  onRefresh,
}: GallerySelectionSessionsPanelProps) => {
  const linksToRender = shareLinks.map((link) => ({
    ...link,
    row: rows.find((row) => row.sharelink_id === link.id) ?? null,
  }));

  return (
    <section className="rounded-3xl border border-border/50 bg-surface p-6 shadow-xs">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-text">Selection Sessions</h2>
          <p className="text-sm text-muted">
            Per-link client selections and selected photo previews.
          </p>
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="rounded-2xl border border-border/50 bg-surface-1">
          <div className="border-b border-border/50 px-4 py-3 text-sm font-semibold text-text">
            Share links
          </div>
          {isLoadingRows ? (
            <div className="p-4 text-sm text-muted">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading sessions...
              </span>
            </div>
          ) : linksToRender.length ? (
            <div className="max-h-96 overflow-auto">
              {linksToRender.map((link) => {
                const isActive = selectedShareLinkId === link.id;
                return (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => onSelectShareLink(link.id)}
                    className={`w-full border-b border-border/40 px-4 py-3 text-left ${
                      isActive ? 'bg-accent/10' : 'hover:bg-surface'
                    }`}
                  >
                    <p className="text-sm font-semibold text-text">
                      {link.label || `Share link ${link.id.slice(0, 8)}`}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      status: {link.row?.status ?? 'not_started'} • sessions:{' '}
                      {link.row?.session_count ?? 0} • selected: {link.row?.selected_count ?? 0}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-sm text-muted">No share links yet.</div>
          )}
        </div>

        <div className="rounded-2xl border border-border/50 bg-surface-1 p-4">
          {isLoadingDetail ? (
            <div className="text-sm text-muted">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading selected link details...
              </span>
            </div>
          ) : detail ? (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-border/40 bg-surface px-3 py-2">
                  <p className="text-xs text-muted">Total sessions</p>
                  <p className="font-semibold text-text">{detail.aggregate.total_sessions}</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-surface px-3 py-2">
                  <p className="text-xs text-muted">Submitted</p>
                  <p className="font-semibold text-text">{detail.aggregate.submitted_sessions}</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-surface px-3 py-2">
                  <p className="text-xs text-muted">In progress</p>
                  <p className="font-semibold text-text">{detail.aggregate.in_progress_sessions}</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-surface px-3 py-2">
                  <p className="text-xs text-muted">Selected photos</p>
                  <p className="font-semibold text-text">{detail.aggregate.selected_count}</p>
                </div>
              </div>

              <div className="rounded-xl border border-border/40 bg-surface">
                <div className="border-b border-border/40 px-3 py-2 text-xs font-semibold uppercase text-muted">
                  Sessions
                </div>
                <div className="max-h-52 overflow-auto">
                  {detail.sessions.length ? (
                    detail.sessions.map((session) => {
                      const isSelected = session.id === selectedSessionId;
                      return (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => onSelectSession(session.id)}
                          className={`w-full border-b border-border/30 px-3 py-2 text-left ${
                            isSelected ? 'bg-accent/10' : 'hover:bg-surface-1'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-text">{session.client_name}</p>
                            <span className="text-xs text-muted">{session.status}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted">
                            selected: {session.selected_count} •{' '}
                            {new Date(session.updated_at).toLocaleString()}
                          </p>
                          <div className="mt-2">
                            {session.status === 'closed' ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onReopenSession(session.id);
                                }}
                                disabled={isMutating}
                                className="inline-flex items-center gap-1 rounded-lg border border-success/40 bg-success/10 px-2 py-1 text-xs font-semibold text-success disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <LockOpen className="h-3 w-3" />
                                Reopen
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onCloseSession(session.id);
                                }}
                                disabled={isMutating}
                                className="inline-flex items-center gap-1 rounded-lg border border-danger/40 bg-danger/10 px-2 py-1 text-xs font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Lock className="h-3 w-3" />
                                Close
                              </button>
                            )}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <p className="px-3 py-3 text-sm text-muted">No sessions yet for this link.</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border/40 bg-surface p-3">
                <h3 className="text-sm font-semibold text-text">Selected photos</h3>
                {sessionDetail?.items?.length ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {sessionDetail.items.map((item) => (
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
                        {item.comment ? (
                          <p className="mt-1 text-xs text-muted">{item.comment}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    No selected photos in the active session.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Pick a share link to inspect sessions.</p>
          )}
        </div>
      </div>
    </section>
  );
};
