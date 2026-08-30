import type { ReactNode, RefObject } from 'react';
import { Check, Eye, EyeOff, FolderPlus, FolderUp, GripHorizontal, Info, Loader2, Settings2 } from 'lucide-react';

import { EnhancedGalleryCard } from '../../dashboard/EnhancedGalleryCard';
import { AppBadge, AppPopover } from '../../ui';
import type { Gallery, ProjectGallerySummary } from '../../../types';
import { VISIBILITY_ACTION_BUTTON_CLASS, cardVariants } from '../constants';
import { ProjectGuidanceItem } from '../ProjectGuidanceItem';
import { toProjectGalleryCard } from '../utils';
import { SortableProjectGalleryGrid } from './SortableProjectGalleryGrid';

interface ProjectGalleriesPanelProps {
  galleries: ProjectGallerySummary[];
  renameGalleryId: string | null;
  renameInput: string;
  isRenamingGallery: boolean;
  renameInputRef: RefObject<HTMLTextAreaElement | null>;
  isUpdatingGallery: string | null;
  isReorderingGallery: string | null;
  requiresReorderConfirmation: boolean;
  openGalleryDialog: () => void;
  onUploadFolder?: () => void;
  isUploadingFolder?: boolean;
  setRenameInput: (value: string) => void;
  handleConfirmRename: () => void;
  cancelInlineRename: () => void;
  beginInlineRename: (gallery: Gallery) => void;
  handleDeleteGallery: (gallery: Gallery) => void;
  setSharingGallery: (gallery: Gallery) => void;
  handleGalleryVisibilityChange: (
    gallery: ProjectGallerySummary,
    visibility: 'listed' | 'direct_only',
  ) => Promise<void>;
  requestGalleryVisibilityChange: (
    gallery: ProjectGallerySummary,
    visibility: 'listed' | 'direct_only',
  ) => void;
  requestReorderGallery: (gallery: ProjectGallerySummary, targetIndex: number) => void;
}

export const ProjectGalleriesPanel = ({
  galleries,
  renameGalleryId,
  renameInput,
  isRenamingGallery,
  renameInputRef,
  isUpdatingGallery,
  isReorderingGallery,
  requiresReorderConfirmation,
  openGalleryDialog,
  onUploadFolder,
  isUploadingFolder = false,
  setRenameInput,
  handleConfirmRename,
  cancelInlineRename,
  beginInlineRename,
  handleDeleteGallery,
  setSharingGallery,
  handleGalleryVisibilityChange,
  requestGalleryVisibilityChange,
  requestReorderGallery,
}: ProjectGalleriesPanelProps) => (
  <div className="space-y-4">
    {galleries.length === 0 ? (
      <div className="rounded-3xl border border-dashed border-border/50 bg-surface-1/60 px-4 py-14 text-center shadow-xs dark:border-border/35 dark:bg-surface-dark-1/60">
        <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <FolderPlus className="h-7 w-7" />
        </div>
        <h3 className="text-xl font-bold text-text">Build this project with galleries</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
          Add the first gallery to start uploading photos. You can keep galleries listed in the
          project share or mark them direct-link-only later.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={openGalleryDialog}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:-translate-y-0.5 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent"
          >
            <FolderPlus className="h-4 w-4" />
            Add first gallery
          </button>
          {onUploadFolder ? (
            <button
              type="button"
              onClick={onUploadFolder}
              disabled={isUploadingFolder}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-5 py-3 text-sm font-semibold text-text transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 dark:border-border/40 dark:bg-surface-dark-1"
            >
              {isUploadingFolder ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderUp className="h-4 w-4" />
              )}
              {isUploadingFolder ? 'Creating gallery…' : 'Upload folder'}
            </button>
          ) : null}
        </div>
      </div>
    ) : (
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted">
            Drag a card by its handle to set the client presentation order. Open a gallery or manage
            project-share visibility from the other card controls.
          </p>
          <AppPopover
            className="relative shrink-0"
            buttonAriaLabel="Project share delivery rules"
            buttonClassName="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border/45 bg-surface-1 px-3 text-sm font-semibold text-text transition-colors hover:border-accent/40 hover:text-accent focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent dark:border-border/30 dark:bg-surface-dark-1"
            buttonContent={
              <>
                <Info className="h-4 w-4" />
                <span className="hidden sm:inline">Delivery rules</span>
              </>
            }
            panelClassName="w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border/50 bg-surface p-3 shadow-xl dark:border-white/10 dark:bg-surface-dark-1"
            panel={
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
                  Delivery rules
                </p>
                <h3 className="mt-1.5 text-lg font-black text-text">Project share logic</h3>
                <p className="mt-1.5 text-sm leading-5 text-muted">
                  Keep the client path predictable before publishing a project-wide link.
                </p>
                <div className="mt-3 space-y-2">
                  <ProjectGuidanceItem
                    icon={Eye}
                    title="Listed galleries show"
                    description="Visible galleries appear as tabs inside every project share link."
                  />
                  <ProjectGuidanceItem
                    icon={EyeOff}
                    title="Direct-only stays private"
                    description="Use direct gallery links for side deliveries that should not appear in the project."
                  />
                  <ProjectGuidanceItem
                    icon={GripHorizontal}
                    title="Order sets the story"
                    description="Move the hero gallery leftmost to make it the first client entry point."
                  />
                </div>
              </div>
            }
          />
        </div>
        <SortableProjectGalleryGrid
          galleries={galleries}
          disabled={isReorderingGallery !== null || renameGalleryId !== null}
          requiresConfirmation={requiresReorderConfirmation}
          onMove={requestReorderGallery}
          renderGallery={(folder, currentIndex, dragHandle: ReactNode) => {
            const galleryCard = toProjectGalleryCard(folder);
            const isFirstGallery = currentIndex === 0;
            const isLastGallery = currentIndex === galleries.length - 1;

            return (
              <div>
                <EnhancedGalleryCard
                  gallery={galleryCard}
                  isRenamingThis={renameGalleryId === galleryCard.id}
                  renameInput={renameInput}
                  isRenaming={isRenamingGallery}
                  renameInputRef={renameInputRef}
                  onRenameInputChange={setRenameInput}
                  onConfirmRename={handleConfirmRename}
                  onCancelRename={cancelInlineRename}
                  onBeginRename={beginInlineRename}
                  onDelete={handleDeleteGallery}
                  onShare={setSharingGallery}
                  extraTopBadges={(() => {
                    const isListed = (folder.project_visibility ?? 'listed') === 'listed';
                    return (
                      <AppBadge
                        tone={isListed ? 'accent' : 'warning'}
                        variant="filled"
                        icon={
                          isListed ? <Check className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />
                        }
                        className={
                          isListed
                            ? 'rounded-md backdrop-blur-sm shadow-none'
                            : 'rounded-md backdrop-blur-sm text-slate-950 shadow-none dark:text-slate-50'
                        }
                      >
                        {isListed ? 'Visible in project' : 'Direct link only'}
                      </AppBadge>
                    );
                  })()}
                  extraActions={
                    <AppPopover
                      key={`${folder.id}-${folder.project_visibility ?? 'listed'}`}
                      className="relative"
                      buttonClassName={VISIBILITY_ACTION_BUTTON_CLASS}
                      buttonAriaLabel={`Change project visibility for ${folder.name}`}
                      buttonContent={<Settings2 className="h-4 w-4" />}
                      panelClassName="w-56 rounded-2xl border border-border/40 bg-surface p-2 shadow-2xl dark:bg-surface-dark"
                      panel={
                        <div className="space-y-1">
                          <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                            Project visibility
                          </p>
                          <button
                            type="button"
                            onClick={() => void handleGalleryVisibilityChange(folder, 'listed')}
                            disabled={isUpdatingGallery === folder.id}
                            className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                              (folder.project_visibility ?? 'listed') === 'listed'
                                ? 'bg-accent/10 text-accent'
                                : 'text-text hover:bg-surface-1'
                            }`}
                          >
                            <Check className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                              <span className="block font-semibold">Visible in project</span>
                              <span className="block text-xs text-muted">
                                Shows in project-wide public links.
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => requestGalleryVisibilityChange(folder, 'direct_only')}
                            disabled={isUpdatingGallery === folder.id}
                            className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                              (folder.project_visibility ?? 'listed') === 'direct_only'
                                ? 'bg-amber-500/10 text-amber-600'
                                : 'text-text hover:bg-surface-1'
                            }`}
                          >
                            <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                              <span className="block font-semibold">Direct link only</span>
                              <span className="block text-xs text-muted">
                                Hidden from project shares, available by direct gallery link.
                              </span>
                            </span>
                          </button>
                          <div className="my-2 h-px bg-border/50" />
                          <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                            Project order
                          </p>
                          <button
                            type="button"
                            onClick={() => requestReorderGallery(folder, currentIndex - 1)}
                            disabled={isFirstGallery || isReorderingGallery !== null}
                            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span>
                              <span className="block font-semibold">Move earlier</span>
                              <span className="block text-xs text-muted">
                                Shift this gallery toward the left/start.
                              </span>
                            </span>
                            <span className="text-xs font-semibold text-muted">
                              {isFirstGallery ? 'First' : '←'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => requestReorderGallery(folder, currentIndex + 1)}
                            disabled={isLastGallery || isReorderingGallery !== null}
                            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span>
                              <span className="block font-semibold">Move later</span>
                              <span className="block text-xs text-muted">
                                Shift this gallery toward the right/end.
                              </span>
                            </span>
                            <span className="text-xs font-semibold text-muted">
                              {isLastGallery ? 'Last' : '→'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => requestReorderGallery(folder, 0)}
                            disabled={isFirstGallery || isReorderingGallery !== null}
                            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span>
                              <span className="block font-semibold">Make leftmost</span>
                              <span className="block text-xs text-muted">
                                This gallery will drive the shared project hero.
                              </span>
                            </span>
                          </button>
                        </div>
                      }
                    />
                  }
                  variants={cardVariants}
                />
                <div className="mt-2 flex items-center justify-between gap-3 px-1">
                  <div className="text-xs text-muted">
                    Position {currentIndex + 1} of {galleries.length}
                  </div>
                  {dragHandle}
                </div>
              </div>
            );
          }}
        />
        <p className="text-sm text-muted">
          Direct-link-only galleries stay hidden from project-wide public shares, but they keep
          their own direct share links.
        </p>
      </div>
    )}
  </div>
);
