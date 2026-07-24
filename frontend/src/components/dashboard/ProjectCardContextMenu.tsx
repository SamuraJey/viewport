import {
  Copy,
  ExternalLink,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Settings,
  Share2,
  Trash2,
} from 'lucide-react';

import { AppPopover } from '../ui';

interface ProjectCardContextMenuProps {
  projectName: string;
  canCopyLink: boolean;
  onCopyLink: () => void;
  onOpenProject: () => void;
  onRename: () => void;
  onAddGallery: () => void;
  onCreateShareLink: () => void;
  onSettings: () => void;
  onDelete: () => void;
}

interface MenuActionProps {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
  close: () => void;
  disabled?: boolean;
  danger?: boolean;
}

const MenuAction = ({
  icon: Icon,
  label,
  onClick,
  close,
  disabled,
  danger,
}: MenuActionProps) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => {
      close();
      onClick();
    }}
    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-45 ${
      danger
        ? 'text-danger hover:bg-danger/10'
        : 'text-text hover:bg-surface-2 dark:hover:bg-surface-dark-2'
    }`}
  >
    <Icon className="h-4 w-4" aria-hidden="true" />
    {label}
  </button>
);

export const ProjectCardContextMenu = ({
  projectName,
  canCopyLink,
  onCopyLink,
  onOpenProject,
  onRename,
  onAddGallery,
  onCreateShareLink,
  onSettings,
  onDelete,
}: ProjectCardContextMenuProps) => (
  <AppPopover
    buttonAriaLabel={`Project actions for ${projectName}`}
    buttonClassName={(open) =>
      `flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent dark:hover:bg-surface-dark-2 ${
        open ? 'bg-surface-2 text-text dark:bg-surface-dark-2' : ''
      }`
    }
    buttonContent={<MoreHorizontal className="h-5 w-5" aria-hidden="true" />}
    panelClassName="mt-2 w-60 rounded-xl border border-border/60 bg-surface p-1.5 shadow-lg dark:border-border/45 dark:bg-surface-dark"
    panelFocus
    panel={(close) => (
      <div role="group" aria-label={`Actions for ${projectName}`}>
        <MenuAction
          icon={Copy}
          label="Copy latest share link"
          onClick={onCopyLink}
          close={close}
          disabled={!canCopyLink}
        />
        <MenuAction icon={ExternalLink} label="Open project" onClick={onOpenProject} close={close} />
        <MenuAction icon={Pencil} label="Rename project" onClick={onRename} close={close} />
        <MenuAction icon={FolderPlus} label="Add gallery" onClick={onAddGallery} close={close} />
        <MenuAction
          icon={Share2}
          label="Create share link"
          onClick={onCreateShareLink}
          close={close}
        />
        <MenuAction icon={Settings} label="Project settings" onClick={onSettings} close={close} />
        <div className="my-1 border-t border-border/45" />
        <MenuAction
          icon={Trash2}
          label="Delete project"
          onClick={onDelete}
          close={close}
          danger
        />
      </div>
    )}
  />
);
