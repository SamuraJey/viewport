import { Command } from 'cmdk';
import { cn } from '../../lib/utils';
import type { Command as CommandType } from './CommandRegistry';

interface CommandItemProps {
  command: CommandType;
  onSelect: () => void;
}

export function CommandItem({
  command,
  onSelect,
}: CommandItemProps): React.ReactElement {
  const Icon = command.icon;

  return (
    <Command.Item
      value={command.id}
      onSelect={onSelect}
      keywords={command.keywords}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-text transition-colors',
        'data-[selected=true]:bg-accent/10 data-[selected=true]:text-text',
        'dark:data-[selected=true]:bg-accent/15',
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      <span className="flex-1 truncate">{command.label}</span>
      {command.shortcut && (
        <div className="flex items-center gap-1">
          {command.shortcut.map((key) => (
            <kbd
              key={key}
              className="rounded border border-border/60 bg-surface px-1.5 py-0.5 text-[10px] font-mono text-muted dark:bg-surface-dark-2"
            >
              {key}
            </kbd>
          ))}
        </div>
      )}
    </Command.Item>
  );
}
