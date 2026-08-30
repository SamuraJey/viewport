import { CircleHelp } from 'lucide-react';
import { AppPopover } from '../ui';

interface AppearanceInfoTooltipProps {
  text: string;
}

export const AppearanceInfoTooltip = ({ text }: AppearanceInfoTooltipProps) => (
  <AppPopover
    className="inline-flex"
    buttonAriaLabel="Appearance info"
    buttonClassName="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-1 hover:text-text focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent dark:hover:bg-surface-dark-1"
    buttonContent={<CircleHelp className="h-4 w-4" strokeWidth={2.25} />}
    anchor="top"
    panelClassName="w-60 rounded-xl border border-border/50 bg-surface p-3 text-xs leading-relaxed text-muted shadow-lg dark:border-white/10 dark:bg-surface-dark-1"
    panel={<p>{text}</p>}
  />
);
