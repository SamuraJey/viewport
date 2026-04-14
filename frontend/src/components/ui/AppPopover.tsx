import type { ComponentProps, RefObject, ReactNode } from 'react';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../lib/utils';

type PopoverAnchor = ComponentProps<typeof PopoverPanel>['anchor'];

const panelVariants = {
  closed: {
    opacity: 0,
    scale: 0.96,
    y: -4,
    transition: { duration: 0.16, ease: 'easeOut' as const },
  },
  open: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.16, ease: 'easeOut' as const },
  },
};

interface AppPopoverProps {
  className?: string;
  buttonClassName?: string | ((open: boolean) => string);
  buttonContent: ReactNode | ((open: boolean) => ReactNode);
  buttonRef?: RefObject<HTMLButtonElement | null>;
  panelClassName?: string;
  panel: ReactNode;
  anchor?: PopoverAnchor;
}

export const AppPopover = ({
  className,
  buttonClassName,
  buttonContent,
  buttonRef,
  panelClassName,
  panel,
  anchor = 'bottom end',
}: AppPopoverProps) => (
  <Popover className={className}>
    {({ open }) => (
      <>
        <PopoverButton
          ref={buttonRef}
          className={cn(
            typeof buttonClassName === 'function' ? buttonClassName(open) : buttonClassName,
          )}
        >
          {typeof buttonContent === 'function' ? buttonContent(open) : buttonContent}
        </PopoverButton>

        <AnimatePresence>
          {open ? (
            <PopoverPanel
              static
              as={motion.div}
              anchor={anchor}
              className={cn('z-20 origin-top-right', panelClassName)}
              variants={panelVariants}
              initial="closed"
              animate="open"
              exit="closed"
            >
              {panel}
            </PopoverPanel>
          ) : null}
        </AnimatePresence>
      </>
    )}
  </Popover>
);
