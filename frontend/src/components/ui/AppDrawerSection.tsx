import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';

interface AppDrawerSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  footerClassName?: string;
}

export const AppDrawerSection = ({
  title,
  description,
  children,
  footer,
  className,
  bodyClassName,
  footerClassName,
}: AppDrawerSectionProps) => (
  <section
    className={cn('overflow-hidden rounded-2xl border border-border/40 bg-surface-1/70', className)}
  >
    {title || description ? (
      <div className="border-b border-border/35 px-4 py-3.5">
        {title ? <h3 className="text-sm font-bold text-text">{title}</h3> : null}
        {description ? <p className="mt-1 text-xs leading-5 text-muted">{description}</p> : null}
      </div>
    ) : null}
    <div className={cn('p-4', bodyClassName)}>{children}</div>
    {footer ? (
      <div className={cn('border-t border-border/35 px-4 py-3', footerClassName)}>{footer}</div>
    ) : null}
  </section>
);
