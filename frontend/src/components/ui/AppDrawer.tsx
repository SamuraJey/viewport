/* oxlint-disable jsx-a11y/no-autofocus -- Vaul's autoFocus prop enables Radix focus management; it is not a DOM autofocus attribute. */
import type { ReactElement, ReactNode, RefObject } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { X } from 'lucide-react';
import { Drawer } from 'vaul';

import { cn } from '../../lib/utils';
import { useOverlayViewport } from '../../hooks/useOverlayViewport';

export type AppDrawerSide = 'right' | 'bottom' | 'left';
export type AppDrawerWidth = 'sm' | 'md' | 'lg';

interface AppDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: AppDrawerSide;
  width?: AppDrawerWidth;
  snapPoints?: Array<number | string>;
  canClose?: boolean;
  nested?: boolean;
  trigger?: ReactElement;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  closeLabel?: string;
}

const DESKTOP_MEDIA_QUERY = '(min-width: 768px)';
const COMPACT_LAYOUT_MEDIA_QUERY = '(max-width: 767px), (pointer: coarse)';
type NestedDrawerRegistration = (drawerId: symbol, open: boolean) => void;
const AppDrawerNestingContext = createContext<NestedDrawerRegistration | null>(null);

const getIsDesktop = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(DESKTOP_MEDIA_QUERY).matches;

const getIsCompactLayout = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(COMPACT_LAYOUT_MEDIA_QUERY).matches;

const useResolvedDirection = (side?: AppDrawerSide) => {
  const [isDesktop, setIsDesktop] = useState(getIsDesktop);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    mediaQuery.addEventListener?.('change', handleChange);

    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, []);

  if (side) return side;
  return isDesktop ? 'right' : 'bottom';
};

const widthClassNames: Record<AppDrawerWidth, string> = {
  sm: 'md:w-96',
  md: 'md:w-[480px]',
  lg: 'md:w-[640px]',
};

export const AppDrawer = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side,
  width = 'md',
  snapPoints,
  canClose = true,
  nested = false,
  trigger,
  eyebrow,
  icon,
  initialFocusRef,
  className,
  headerClassName,
  bodyClassName,
  footerClassName,
  closeLabel = 'Close drawer',
}: AppDrawerProps) => {
  const viewport = useOverlayViewport(open && !snapPoints);
  const direction = useResolvedDirection(side);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const registerWithParentDrawer = useContext(AppDrawerNestingContext);
  const nestingIdRef = useRef(Symbol('app-drawer'));
  const openNestedDrawersRef = useRef(new Set<symbol>());
  const [openNestedDrawerCount, setOpenNestedDrawerCount] = useState(0);
  const resolvedSnapPoints = direction === 'bottom' ? snapPoints : undefined;
  const firstSnapPoint = resolvedSnapPoints?.[0] ?? null;
  const [activeSnapPoint, setActiveSnapPoint] = useState<number | string | null>(firstSnapPoint);
  const [lastSnapResetKey, setLastSnapResetKey] = useState(`${open}|${firstSnapPoint}`);
  if (lastSnapResetKey !== `${open}|${firstSnapPoint}`) {
    setLastSnapResetKey(`${open}|${firstSnapPoint}`);
    if (open && firstSnapPoint !== null) {
      setActiveSnapPoint(firstSnapPoint);
    }
  }

  useLayoutEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
    }
  }, [open]);

  useEffect(() => {
    if (!nested || !registerWithParentDrawer) return;

    const nestingId = nestingIdRef.current;
    registerWithParentDrawer(nestingId, open);
    return () => registerWithParentDrawer(nestingId, false);
  }, [nested, open, registerWithParentDrawer]);

  const registerNestedDrawer = useCallback<NestedDrawerRegistration>((drawerId, isOpen) => {
    if (isOpen) {
      openNestedDrawersRef.current.add(drawerId);
    } else {
      openNestedDrawersRef.current.delete(drawerId);
    }
    setOpenNestedDrawerCount(openNestedDrawersRef.current.size);
  }, []);

  const hasOpenNestedDrawer = openNestedDrawerCount > 0;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && (!canClose || hasOpenNestedDrawer)) return;
    onOpenChange(nextOpen);
  };

  const Root = nested ? Drawer.NestedRoot : Drawer.Root;
  const isBottom = direction === 'bottom';
  const isLeft = direction === 'left';

  return (
    <AppDrawerNestingContext.Provider value={registerNestedDrawer}>
      <Root
        open={open}
        onOpenChange={handleOpenChange}
        direction={direction}
        dismissible={canClose && !hasOpenNestedDrawer}
        modal
        autoFocus
        handleOnly={!isBottom || !snapPoints}
        repositionInputs={Boolean(snapPoints)}
        shouldScaleBackground={!nested}
        snapPoints={resolvedSnapPoints}
        activeSnapPoint={activeSnapPoint}
        setActiveSnapPoint={setActiveSnapPoint}
      >
        {trigger ? <Drawer.Trigger asChild>{trigger}</Drawer.Trigger> : null}
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out data-[state=open]:fade-in" />
          <Drawer.Content
            ref={contentRef}
            tabIndex={-1}
            data-testid="app-drawer-content"
            data-side={direction}
            data-keyboard-open={viewport?.keyboardOpen ? 'true' : 'false'}
            data-lenis-prevent="true"
            style={
              viewport
                ? {
                    height:
                      isBottom && !snapPoints ? undefined : viewport.height - (isBottom ? 12 : 0),
                    maxHeight: viewport.height - (isBottom ? 12 : 0),
                    bottom: viewport.bottom,
                    top: isBottom ? 'auto' : viewport.top,
                  }
                : isBottom && snapPoints
                  ? { height: '96dvh' }
                  : undefined
            }
            onOpenAutoFocus={(event) => {
              if (isBottom && getIsCompactLayout()) {
                event.preventDefault();
                contentRef.current?.focus({ preventScroll: true });
              } else if (initialFocusRef?.current) {
                event.preventDefault();
                initialFocusRef.current.focus();
              }
            }}
            onCloseAutoFocus={(event) => {
              if (!previousFocusRef.current) return;
              event.preventDefault();
              previousFocusRef.current.focus();
            }}
            className={cn(
              'app-drawer fixed z-50 flex min-h-0 min-w-0 overflow-clip border-border/50 bg-surface text-text shadow-2xl outline-none dark:border-border/30',
              isBottom
                ? 'inset-x-0 bottom-0 max-h-[96dvh] flex-col rounded-t-[1.75rem] border border-b-0'
                : 'inset-y-0 h-dvh max-w-[calc(100vw-1rem)] flex-col border',
              !isBottom && widthClassNames[width],
              !isBottom && isLeft
                ? 'left-0 rounded-r-[1.75rem] border-l-0'
                : !isBottom
                  ? 'right-0 rounded-l-[1.75rem] border-r-0'
                  : undefined,
              className,
            )}
          >
            {isBottom ? (
              <div className="flex h-7 shrink-0 items-center justify-center" aria-hidden="true">
                <Drawer.Handle className="h-1.5 w-12 rounded-full bg-border/80" />
              </div>
            ) : null}

            <header
              style={viewport ? { maxHeight: Math.max(80, viewport.height * 0.3) } : undefined}
              className={cn(
                'app-drawer-header relative flex shrink-0 items-start gap-3 border-b border-border/40 bg-surface/95 px-4 pb-3 pt-4 backdrop-blur-xl dark:border-border/30 md:px-6 md:pb-4 md:pt-5',
                isBottom && 'pt-2',
                headerClassName,
              )}
            >
              {icon ? (
                <div
                  data-drawer-icon
                  className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-accent/10 text-accent"
                >
                  {icon}
                </div>
              ) : null}
              <div className="min-w-0 flex-1 pr-10">
                {eyebrow ? (
                  <p
                    data-drawer-eyebrow
                    className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-accent"
                  >
                    {eyebrow}
                  </p>
                ) : null}
                <Drawer.Title className="font-oswald text-xl font-bold uppercase tracking-wide text-text md:text-2xl">
                  {title}
                </Drawer.Title>
                {description ? (
                  <Drawer.Description
                    data-drawer-description
                    className="mt-1 text-sm leading-5 text-muted"
                  >
                    {description}
                  </Drawer.Description>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                disabled={!canClose || hasOpenNestedDrawer}
                aria-label={closeLabel}
                className="absolute right-3 top-2 flex h-11 w-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-1 hover:text-text focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-surface-dark-1 md:right-5 md:top-5"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div
              data-overlay-scroll
              className={cn(
                'min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-6 md:py-5',
                bodyClassName,
              )}
            >
              {children}
            </div>

            {footer ? (
              <footer
                className={cn(
                  'app-drawer-footer shrink-0 border-t border-border/40 bg-surface/95 px-4 py-3 backdrop-blur-xl dark:border-border/30 md:px-6 md:py-4',
                  footerClassName,
                )}
              >
                {footer}
              </footer>
            ) : null}
          </Drawer.Content>
        </Drawer.Portal>
      </Root>
    </AppDrawerNestingContext.Provider>
  );
};
