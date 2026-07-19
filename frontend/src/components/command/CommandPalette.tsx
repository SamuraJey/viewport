import { useMemo, useRef, useState, useEffect, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { cn } from '../../lib/utils';
import { createStaticCommands } from './CommandRegistry';
import type { Command as CommandType } from './CommandRegistry';
import { CommandItem } from './CommandItem';
import { readCommandHistory, pushCommandHistory } from './commandHistory';
import { useCommandItems } from '../../hooks/useCommandItems';
import { AppDialog, AppDialogTitle } from '../ui';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenShortcuts?: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onOpenShortcuts,
}: CommandPaletteProps): React.ReactElement | null {
  const navigate = useNavigate();
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const logout = useAuthStore((s) => s.logout);
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  const performers = useMemo(
    () => ({
      navigate,
      toggleTheme,
      focusSearch: () => {
        const el = document.querySelector<HTMLInputElement>(
          'input[type="search"], input[role="searchbox"], [data-command-search]',
        );
        if (el) {
          window.requestAnimationFrame(() => el.focus());
        }
      },
      openShortcuts: () => {
        onOpenChange(false);
        onOpenShortcuts?.();
      },
      signOut: () => {
        logout();
        navigate('/auth/login');
      },
    }),
    [navigate, toggleTheme, logout, onOpenShortcuts, onOpenChange],
  );

  const staticCommands = useMemo(
    () => createStaticCommands(performers),
    [performers],
  );

  const { projects, shareLinks, isLoading } = useCommandItems({ enabled: open });

  const historyIds = useMemo(
    () => (search.trim() === '' ? readCommandHistory() : []),
    [search],
  );

  const recentCommands = useMemo(
    () =>
      historyIds
        .map((id) => staticCommands.find((c) => c.id === id))
        .filter((c): c is CommandType => Boolean(c)),
    [historyIds, staticCommands],
  );

  const handleSelect = (cmd: CommandType) => {
    pushCommandHistory(cmd.id);
    void cmd.perform();
    onOpenChange(false);
  };

  const groupHeadingClass = cn(
    '[&_[cmdk-group-heading]]:px-2',
    '[&_[cmdk-group-heading]]:py-1.5',
    '[&_[cmdk-group-heading]]:text-xs',
    '[&_[cmdk-group-heading]]:font-semibold',
    '[&_[cmdk-group-heading]]:uppercase',
    '[&_[cmdk-group-heading]]:tracking-wide',
    '[&_[cmdk-group-heading]]:text-muted',
  );

  const navCommands = staticCommands.filter((c) => c.group === 'navigation');
  const actionCommands = staticCommands.filter((c) => c.group === 'actions');
  const themeCommands = staticCommands.filter((c) => c.group === 'theme');
  const settingsCommands = staticCommands.filter((c) => c.group === 'settings');

  return (
    <AppDialog
      open={open}
      onClose={() => onOpenChange(false)}
      size="lg"
      initialFocusRef={inputRef as RefObject<HTMLElement | null>}
      panelClassName="overflow-hidden rounded-3xl border border-border/50 bg-surface shadow-2xl dark:border-border/30 dark:bg-surface-dark"
    >
      <AppDialogTitle className="sr-only">Command palette</AppDialogTitle>

      <Command
        label="Global command palette"
        shouldFilter
        loop
        className="flex flex-col"
      >
        <Command.Input
          ref={inputRef}
          value={search}
          onValueChange={setSearch}
          placeholder="Type a command or search…"
          className="w-full border-b border-border/40 bg-transparent px-4 py-3 text-sm text-text outline-none placeholder:text-muted dark:border-border/30"
        />

        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
            No results found.
          </Command.Empty>

          {recentCommands.length > 0 && (
            <Command.Group heading="Recent" className={groupHeadingClass}>
              {recentCommands.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  command={cmd}
                  onSelect={() => handleSelect(cmd)}
                />
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Navigation" className={groupHeadingClass}>
            {navCommands.map((cmd) => (
              <CommandItem
                key={cmd.id}
                command={cmd}
                onSelect={() => handleSelect(cmd)}
              />
            ))}
          </Command.Group>

          <Command.Group heading="Actions" className={groupHeadingClass}>
            {actionCommands.map((cmd) => (
              <CommandItem
                key={cmd.id}
                command={cmd}
                onSelect={() => handleSelect(cmd)}
              />
            ))}
          </Command.Group>

          {projects.length > 0 && (
            <Command.Group heading="Recent projects" className={groupHeadingClass}>
              {projects.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  command={cmd}
                  onSelect={() => handleSelect(cmd)}
                />
              ))}
            </Command.Group>
          )}

          {shareLinks.length > 0 && (
            <Command.Group
              heading="Active share links"
              className={groupHeadingClass}
            >
              {shareLinks.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  command={cmd}
                  onSelect={() => handleSelect(cmd)}
                />
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Theme" className={groupHeadingClass}>
            {themeCommands.map((cmd) => (
              <CommandItem
                key={cmd.id}
                command={cmd}
                onSelect={() => handleSelect(cmd)}
              />
            ))}
          </Command.Group>

          <Command.Group heading="Settings" className={groupHeadingClass}>
            {settingsCommands.map((cmd) => (
              <CommandItem
                key={cmd.id}
                command={cmd}
                onSelect={() => handleSelect(cmd)}
              />
            ))}
          </Command.Group>

          {isLoading && (
            <div className="px-3 py-2 text-xs text-muted">Loading\u2026</div>
          )}
        </Command.List>
      </Command>
    </AppDialog>
  );
}
