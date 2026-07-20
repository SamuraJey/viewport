import { Toaster } from 'sonner';
import { useThemeStore } from '../stores/themeStore';

/**
 * App-level toast notification container (RFC 004).
 *
 * Wires sonner's `<Toaster>` to the app's theme store so toasts follow the
 * user's light/dark preference. Styled with semantic tokens so success/error/
 * warning/info variants stay consistent with the rest of the UI. Rich colors
 * are enabled for clear visual differentiation of toast types.
 *
 * `position="bottom-right"` on desktop is less intrusive; sonner handles
 * mobile stacking automatically. `closeButton` gives an explicit dismiss
 * affordance. `duration={4000}` matches the RFC spec.
 */
export const AppToaster = () => {
  const theme = useThemeStore((state) => state.theme);

  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      richColors
      closeButton
      duration={4000}
      toastOptions={{
        classNames: {
          toast:
            'rounded-2xl border border-border/50 bg-surface/95 backdrop-blur-xl text-text shadow-lg',
          title: 'text-text font-semibold',
          description: 'text-muted',
          actionButton: 'bg-accent text-accent-foreground',
          cancelButton: 'bg-surface-2 text-muted dark:bg-surface-dark-2 dark:text-muted-dark',
          closeButton:
            'text-muted hover:text-text rounded-lg transition-colors',
        },
      }}
    />
  );
};
