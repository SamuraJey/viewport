import { ExternalLink, FolderPlus, Link2 } from 'lucide-react';

interface ProjectCardActionsProps {
  canOpenShare: boolean;
  onCopyLink: () => void;
  onOpenShare: () => void;
  onAddGallery: () => void;
}

const actionClassName =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-45';

export const ProjectCardActions = ({
  canOpenShare,
  onCopyLink,
  onOpenShare,
  onAddGallery,
}: ProjectCardActionsProps) => (
  <div className="flex items-center rounded-xl bg-black/72 p-1 shadow-lg backdrop-blur-sm">
    <button
      type="button"
      className={actionClassName}
      onClick={onCopyLink}
      disabled={!canOpenShare}
      aria-label="Copy latest project share link"
    >
      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
      Copy
    </button>
    <button
      type="button"
      className={actionClassName}
      onClick={onOpenShare}
      disabled={!canOpenShare}
      aria-label="Open latest project share page"
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      View
    </button>
    <button
      type="button"
      className={actionClassName}
      onClick={onAddGallery}
      aria-label="Add gallery to project"
    >
      <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
      Gallery
    </button>
  </div>
);
