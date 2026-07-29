import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export const Skeleton = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    {...props}
    aria-hidden="true"
    className={cn(
      'animate-pulse bg-surface-2 dark:bg-surface-dark-2 motion-reduce:animate-none',
      className,
    )}
  />
);
