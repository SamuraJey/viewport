import {
  useState,
  useCallback,
  type CSSProperties,
  type ComponentProps,
  type MutableRefObject,
  type RefObject,
  type ReactNode,
} from 'react';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../lib/utils';

type PopoverAnchor = ComponentProps<typeof PopoverPanel>['anchor'];
type AppPopoverClose = (
  focusableElement?: HTMLElement | MutableRefObject<HTMLElement | null>,
) => void;
type AppPopoverPanel = ReactNode | ((close: AppPopoverClose) => ReactNode);

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
  buttonAriaLabel?: string;
  buttonId?: string;
  disabled?: boolean;
  topLayerAnchor?: string;
  buttonContent: ReactNode | ((open: boolean) => ReactNode);
  buttonRef?: RefObject<HTMLButtonElement | null>;
  panelClassName?: string;
  panel: AppPopoverPanel;
  panelFocus?: boolean;
  anchor?: PopoverAnchor;
}

const AnimatedPopoverPanel = ({
  anchor,
  topLayerAnchor,
  panelFocus,
  panelClassName,
  panel,
}: Pick<
  AppPopoverProps,
  'anchor' | 'panelFocus' | 'panelClassName' | 'panel' | 'topLayerAnchor'
>) => {
  const [entered, setEntered] = useState(false);

  const showPanel = useCallback(
    (node: HTMLDivElement | null) => {
      if (topLayerAnchor && node?.isConnected) node.showPopover?.();
    },
    [topLayerAnchor],
  );

  return (
    <PopoverPanel
      static
      as={motion.div}
      ref={showPanel}
      popover={
        topLayerAnchor &&
        typeof HTMLElement !== 'undefined' &&
        'showPopover' in HTMLElement.prototype
          ? 'manual'
          : undefined
      }
      style={topLayerAnchor ? ({ positionAnchor: topLayerAnchor } as CSSProperties) : undefined}
      anchor={topLayerAnchor ? undefined : anchor}
      // Anchored panels mount in a portal before their coordinates are resolved.
      // Wait for the enter animation before focusing an action so the browser
      // cannot scroll to the portal's initial origin.
      focus={panelFocus && entered}
      className={cn(
        'z-50 max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain origin-top-right [--anchor-padding:12px]',
        panelClassName,
      )}
      variants={panelVariants}
      initial="closed"
      animate="open"
      exit="closed"
      onAnimationComplete={(definition) => {
        if (definition === 'open') setEntered(true);
      }}
    >
      {({ close }) => <>{typeof panel === 'function' ? panel(close) : panel}</>}
    </PopoverPanel>
  );
};

export const AppPopover = ({
  className,
  buttonClassName,
  buttonAriaLabel,
  buttonId,
  disabled,
  topLayerAnchor,
  buttonContent,
  buttonRef,
  panelClassName,
  panel,
  panelFocus = false,
  anchor = 'bottom end',
}: AppPopoverProps) => (
  <Popover className={className}>
    {({ open }) => (
      <>
        <PopoverButton
          id={buttonId}
          disabled={disabled}
          style={topLayerAnchor ? ({ anchorName: topLayerAnchor } as CSSProperties) : undefined}
          ref={buttonRef}
          aria-label={buttonAriaLabel}
          onMouseDown={(event) => {
            if (event.button === 0) {
              event.preventDefault();
            }
          }}
          className={cn(
            typeof buttonClassName === 'function' ? buttonClassName(open) : buttonClassName,
          )}
        >
          {typeof buttonContent === 'function' ? buttonContent(open) : buttonContent}
        </PopoverButton>

        <AnimatePresence>
          {open ? (
            <AnimatedPopoverPanel
              anchor={anchor}
              topLayerAnchor={topLayerAnchor}
              panelFocus={panelFocus}
              panelClassName={panelClassName}
              panel={panel}
            />
          ) : null}
        </AnimatePresence>
      </>
    )}
  </Popover>
);
