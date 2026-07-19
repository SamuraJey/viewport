import type { LucideIcon } from 'lucide-react';
import {
  Home,
  Share2,
  FolderPlus,
  Search,
  Moon,
  Keyboard,
  Accessibility,
  LogOut,
} from 'lucide-react';
import { requestCreateProject } from './commandActions';

export type CommandGroup = 'navigation' | 'actions' | 'settings' | 'theme';

export interface Command {
  id: string;
  label: string;
  group: CommandGroup;
  icon: LucideIcon;
  shortcut?: string[];
  keywords?: string[];
  perform: () => void | Promise<void>;
  when?: () => boolean;
}

export interface CommandPerformers {
  navigate: (path: string) => void;
  toggleTheme: () => void;
  focusSearch: () => void;
  openShortcuts: () => void;
  signOut: () => void;
}

export function createStaticCommands(perf: CommandPerformers): Command[] {
  return [
    {
      id: 'go-dashboard',
      label: 'Go to dashboard',
      group: 'navigation',
      icon: Home,
      shortcut: ['g', 'd'],
      keywords: ['dashboard', 'home', 'projects', 'galleries'],
      perform: () => perf.navigate('/dashboard'),
    },
    {
      id: 'go-share-links',
      label: 'Go to share links',
      group: 'navigation',
      icon: Share2,
      shortcut: ['g', 's'],
      keywords: ['share', 'links', 'gallery'],
      perform: () => perf.navigate('/share-links'),
    },
    {
      id: 'new-project',
      label: 'Create new project',
      group: 'actions',
      icon: FolderPlus,
      shortcut: ['n'],
      keywords: ['new', 'create', 'project', 'add'],
      perform: () => requestCreateProject(perf.navigate),
    },
    {
      id: 'focus-search',
      label: 'Focus search',
      group: 'actions',
      icon: Search,
      shortcut: ['/'],
      keywords: ['search', 'find', 'focus'],
      perform: () => perf.focusSearch(),
    },
    {
      id: 'toggle-theme',
      label: 'Toggle theme',
      group: 'theme',
      icon: Moon,
      shortcut: ['shift', 't'],
      keywords: ['theme', 'dark', 'light', 'mode'],
      perform: () => perf.toggleTheme(),
    },
    {
      id: 'open-shortcuts',
      label: 'Keyboard shortcuts',
      group: 'settings',
      icon: Keyboard,
      shortcut: ['?'],
      keywords: ['shortcuts', 'help', 'keyboard'],
      perform: () => perf.openShortcuts(),
    },
    {
      id: 'go-accessibility',
      label: 'Accessibility settings',
      group: 'settings',
      icon: Accessibility,
      keywords: ['accessibility', 'a11y', 'settings'],
      perform: () => perf.navigate('/accessibility'),
    },
    {
      id: 'sign-out',
      label: 'Sign out',
      group: 'settings',
      icon: LogOut,
      keywords: ['sign out', 'logout', 'exit'],
      perform: () => perf.signOut(),
    },
  ];
}
