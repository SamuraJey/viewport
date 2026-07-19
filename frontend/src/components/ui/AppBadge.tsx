import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type BadgeTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral' | 'accent';
type BadgeVariant = 'filled' | 'subtle';

/**
 * AppBadge — semantic tone badge.
 *
 * RFC §1.5 proposes a tone-only API.  This implementation adds an optional
 * `variant` prop (one extra key, orthogonal to `tone`) so that a single
 * component covers both the filled badges used in PhotoCard
 * ({@code bg-{tone}/90 text-white backdrop-blur-md}) and the subtle badges
 * used in ShareLinkStatusBadge / CollectionShareBadge / AppearanceEditor
 * ({@code border bg-{tone}/10 text-{tone}-dark}).  The single-prop
 * extension keeps the migration surface small while serving every current
 * badge pattern in the codebase.
 */
interface AppBadgeProps {
  tone: BadgeTone;
  variant?: BadgeVariant;
  icon?: ReactNode;
  children: ReactNode;
  size?: 'xs' | 'sm';
  className?: string;
  /** Accessible label exposed to screen readers via role="img". */
  'aria-label'?: string;
}

/* ------------------------------------------------------------------ */
/*  Style maps                                                        */
/* ------------------------------------------------------------------ */

const filledBg: Record<BadgeTone, string> = {
  success: 'bg-success/90',
  warning: 'bg-warning/90',
  info: 'bg-info/90',
  danger: 'bg-danger/90',
  accent: 'bg-accent/90',
  neutral: 'bg-neutral-500/90',
};

const filledText: Record<BadgeTone, string> = {
  success: 'text-white',
  warning: 'text-warning-foreground',
  info: 'text-info-foreground',
  danger: 'text-white',
  accent: 'text-white',
  neutral: 'text-white',
};

const subtleContainer: Record<BadgeTone, string> = {
  success: 'border-success/30 bg-success/10',
  warning: 'border-warning/30 bg-warning/10',
  info: 'border-info/30 bg-info/10',
  danger: 'border-danger/30 bg-danger/10',
  accent: 'border-accent/30 bg-accent/10',
  neutral: 'border-neutral-400/30 bg-neutral-100 dark:bg-neutral-800/30',
};

const subtleText: Record<BadgeTone, string> = {
  success: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  info: 'text-sky-700 dark:text-sky-300',
  danger: 'text-red-700 dark:text-red-300',
  accent: 'text-accent',
  neutral: 'text-muted',
};

const sizeClasses: Record<'xs' | 'sm', string> = {
  sm: 'px-2.5 py-1 text-xs',
  xs: 'px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]',
};

const filledBase = 'inline-flex items-center gap-1.5 rounded-full font-semibold backdrop-blur-md shadow-lg';
const subtleBase = 'inline-flex items-center gap-1.5 rounded-full font-semibold border';

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export const AppBadge = ({
  tone,
  variant = 'filled',
  icon,
  children,
  size = 'sm',
  className,
  'aria-label': ariaLabel,
}: AppBadgeProps) => {
  const base = variant === 'filled' ? filledBase : subtleBase;
  const toneBg = variant === 'filled' ? filledBg[tone] : subtleContainer[tone];
  const toneText = variant === 'filled' ? filledText[tone] : subtleText[tone];
  const sizeClass = sizeClasses[size];

  return (
    <span
      className={cn(base, toneBg, toneText, sizeClass, className)}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </span>
  );
};
