import type {
  HTMLAttributes,
  MutableRefObject,
  PropsWithChildren,
  ReactNode,
  RefObject,
} from 'react';
import { useCallback, useLayoutEffect, useRef } from 'react';
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
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '5xl';
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
  size = 'md',
  className,
  containerClassName,
  backdropClassName,
  panelClassName,
  panelProps,
  initialFocusRef,
  children,
}: AppDialogProps) => {
  const { className: panelPropsClassName, ...panelAttributes } = panelProps ?? {};
  const ignoreInitialCloseRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const sizeClassName =
    size === 'sm'
      ? 'max-w-md'
      : size === 'lg'
        ? 'max-w-xl'
        : size === 'xl'
          ? 'max-w-2xl'
          : size === '2xl'
            ? 'max-w-3xl'
            : size === '5xl'
              ? 'max-w-5xl'
              : 'max-w-lg';

  useLayoutEffect(() => {
    if (!open) {
      ignoreInitialCloseRef.current = false;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      return;
    }

    ignoreInitialCloseRef.current = true;
    frameRef.current = requestAnimationFrame(() => {
      ignoreInitialCloseRef.current = false;
      frameRef.current = null;
    });

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [open]);

  const handleClose = useCallback(() => {
    if (!canClose) {
      return;
    }

    if (ignoreInitialCloseRef.current) {
      return;
    }

    onClose();
  }, [canClose, onClose]);

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
        <DialogPanel
          {...panelAttributes}
          className={cn('mx-auto w-full', sizeClassName, panelPropsClassName)}
        >
          <motion.div
            className={cn('relative w-full', panelClassName)}
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
