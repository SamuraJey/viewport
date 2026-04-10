import type {
  HTMLAttributes,
  MutableRefObject,
  PropsWithChildren,
  ReactNode,
  RefObject,
} from 'react';
import { useLayoutEffect, useRef } from 'react';
import { Description, Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

type FocusRef =
  | MutableRefObject<HTMLElement | null>
  | RefObject<HTMLElement | null>
  | null
  | undefined;

type DataAttributes = {
  [key in `data-${string}`]?: string | number | boolean | undefined;
};

interface AppDialogProps extends PropsWithChildren {
  open: boolean;
  onClose: () => void;
  canClose?: boolean;
  className?: string;
  containerClassName?: string;
  backdropClassName?: string;
  panelClassName?: string;
  panelProps?: HTMLAttributes<HTMLDivElement> & DataAttributes;
  initialFocusRef?: FocusRef;
}

export const AppDialog = ({
  open,
  onClose,
  canClose = true,
  className,
  containerClassName,
  backdropClassName,
  panelClassName,
  panelProps,
  initialFocusRef,
  children,
}: AppDialogProps) => {
  const ignoreCloseRef = useRef(false);
  const openedAtRef = useRef(0);
  const wasOpenRef = useRef(false);

  if (open && !wasOpenRef.current) {
    ignoreCloseRef.current = true;
    openedAtRef.current = Date.now();
  }

  useLayoutEffect(() => {
    wasOpenRef.current = open;

    if (!open) {
      ignoreCloseRef.current = false;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      ignoreCloseRef.current = false;
    }, 200);

    return () => {
      window.clearTimeout(timeoutId);
      ignoreCloseRef.current = false;
    };
  }, [open]);

  const handleClose = () => {
    if (ignoreCloseRef.current || Date.now() - openedAtRef.current < 200) {
      return;
    }

    if (canClose) {
      onClose();
    }
  };

  if (!open) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      initialFocus={initialFocusRef ?? undefined}
      className={cn('relative z-50', className)}
    >
      <motion.div
        aria-hidden="true"
        className={cn('fixed inset-0 bg-black/50 backdrop-blur-sm', backdropClassName)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />

      <div
        className={cn(
          'fixed inset-0 flex w-screen items-center justify-center p-4',
          containerClassName,
        )}
      >
        <DialogPanel {...panelProps}>
          <motion.div
            className={cn('relative w-full max-w-lg', panelClassName)}
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {children}
          </motion.div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};

interface AppDialogTextProps extends PropsWithChildren {
  className?: string;
  children: ReactNode;
}

export const AppDialogTitle = ({ className, children }: AppDialogTextProps) => (
  <DialogTitle className={className}>{children}</DialogTitle>
);

export const AppDialogDescription = ({ className, children }: AppDialogTextProps) => (
  <Description className={className}>{children}</Description>
);
