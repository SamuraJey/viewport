import { motion, type HTMLMotionProps, type Variants } from 'framer-motion';
import { Link2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';
import { AppBadge } from '../ui';

interface CollectionCardProps
  extends Pick<
    HTMLMotionProps<'article'>,
    'onMouseEnter' | 'onMouseLeave' | 'onFocusCapture' | 'onBlurCapture'
  > {
  ariaLabel: string;
  body: ReactNode;
  bodyClassName?: string;
  cover: ReactNode;
  footer?: ReactNode;
  interactiveOverlay?: ReactNode;
  variants?: Variants;
}

const DEFAULT_SHELL_CLASSNAME =
  'group/card relative flex h-full min-w-0 w-full flex-col overflow-hidden rounded-3xl border border-card-border bg-surface text-left shadow-sm transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-xl focus-within:ring-[3px] focus-within:ring-accent dark:bg-surface-dark motion-reduce:transform-none motion-reduce:transition-none';

interface CollectionCardCoverProps {
  children: ReactNode;
  className?: string;
  persistentTopRightOverlay?: ReactNode;
  topOverlay?: ReactNode;
  topRightOverlay?: ReactNode;
}

export const CollectionCardCover = ({
  children,
  className,
  persistentTopRightOverlay,
  topOverlay,
  topRightOverlay,
}: CollectionCardCoverProps) => (
  <div
    className={cn(
      'relative h-52 overflow-hidden bg-surface-2 dark:bg-surface-dark-2',
      className,
    )}
  >
    {children}
    {topOverlay ? (
      <div className="absolute left-4 top-4 z-20 flex items-center gap-2">{topOverlay}</div>
    ) : null}
    {persistentTopRightOverlay ? (
      <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
        {persistentTopRightOverlay}
      </div>
    ) : null}
    {topRightOverlay ? (
      <div className="pointer-events-none absolute right-3 top-14 z-30 flex gap-2 opacity-0 transition-opacity duration-200 group-hover/card:pointer-events-auto group-hover/card:opacity-100 group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100 sm:top-3">
        {topRightOverlay}
      </div>
    ) : null}
  </div>
);

interface CollectionCardTitleProps {
  as: 'h2' | 'h3';
  children: ReactNode;
  className?: string;
  title?: string;
}

export const CollectionCardTitle = ({
  as: Component,
  children,
  className,
  title,
}: CollectionCardTitleProps) => (
  <Component
    className={cn(
      'line-clamp-2 wrap-anywhere font-oswald text-xl font-bold uppercase leading-6 text-text transition-colors group-hover/card:text-accent',
      className,
    )}
    title={title}
  >
    {children}
  </Component>
);

export interface CollectionCardMetric {
  emphasized?: boolean;
  label: string;
  value: string;
}

export const CollectionCardMetrics = ({ items }: { items: CollectionCardMetric[] }) => (
  <div
    className="grid divide-x divide-border/45 border-t border-border/45 bg-surface-1/80 dark:divide-border/35 dark:border-border/35 dark:bg-surface-dark-1/70"
    style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
  >
    {items.map(({ emphasized = false, label, value }) => (
      <div key={label} className="min-w-0 px-3 py-3 first:pl-4 last:pr-4">
        <p
          className={cn(
            'truncate text-base font-bold tabular-nums',
            emphasized ? 'text-success dark:text-success' : 'text-text',
          )}
          title={`${value} ${label.toLowerCase()}`}
        >
          {value}
        </p>
        <p className="mt-0.5 text-xs font-medium text-muted">{label}</p>
      </div>
    ))}
  </div>
);

export const CollectionShareBadge = ({
  icon = <Link2 className="h-3.5 w-3.5" />,
  label = 'Public',
}: {
  icon?: ReactNode;
  label?: string;
}) => (
  <AppBadge
    tone="success"
    variant="subtle"
    size="xs"
    icon={icon}
    className="backdrop-blur-sm"
  >
    {label}
  </AppBadge>
);

export const CollectionCard = ({
  ariaLabel,
  body,
  bodyClassName = 'relative flex min-h-28 flex-1 flex-col p-4',
  cover,
  footer,
  interactiveOverlay,
  variants,
  ...interactionProps
}: CollectionCardProps) => {
  return (
    <motion.article
      layout
      aria-label={ariaLabel}
      variants={variants}
      exit="exit"
      className={DEFAULT_SHELL_CLASSNAME}
      {...interactionProps}
    >
      {interactiveOverlay}
      {cover}
      <div className={bodyClassName}>{body}</div>
      {footer}
    </motion.article>
  );
};
