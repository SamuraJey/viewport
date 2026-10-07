import { preloadRoute } from '../lib/preloadRoute';
import { lazy, Suspense, useCallback, useState } from 'react';
import { Outlet } from 'react-router';
import { RequireAuth } from './RequireAuth';
import { Layout } from './Layout';
import { useAuthStore } from '../stores/authStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { OverlayLoading } from './ui/OverlayLoading';

const KeyboardShortcutsDialog = lazy(() =>
  preloadRoute('KeyboardShortcutsDialog', () => import('./a11y/KeyboardShortcutsDialog')).then(
    (module) => ({
      default: module.KeyboardShortcutsDialog,
    }),
  ),
);
const CommandPalette = lazy(() =>
  preloadRoute('CommandPalette', () => import('./command/CommandPalette')).then((module) => ({
    default: module.CommandPalette,
  })),
);

export const ProtectedLayout = () => {
  const { isAuthenticated } = useAuthStore();
  const { isOpen, setIsOpen, paletteOpen, setPaletteOpen } = useKeyboardShortcuts({
    enabled: isAuthenticated,
  });
  const [requested, setRequested] = useState({ shortcuts: false, palette: false });
  if ((isOpen && !requested.shortcuts) || (paletteOpen && !requested.palette)) {
    setRequested({
      shortcuts: requested.shortcuts || isOpen,
      palette: requested.palette || paletteOpen,
    });
  }
  const handleOpenShortcuts = useCallback(() => {
    setPaletteOpen(false);
    setIsOpen(true);
  }, [setPaletteOpen, setIsOpen]);

  return (
    <RequireAuth>
      <Layout onOpenCommandPalette={() => setPaletteOpen(true)}>
        <Outlet />
      </Layout>
      {isAuthenticated && (
        <Suspense
          fallback={
            <OverlayLoading
              open={isOpen || paletteOpen}
              onClose={() => {
                setIsOpen(false);
                setPaletteOpen(false);
              }}
              label="Loading dialog"
            />
          }
        >
          {requested.shortcuts && (
            <KeyboardShortcutsDialog open={isOpen} onClose={() => setIsOpen(false)} />
          )}
          {requested.palette && (
            <CommandPalette
              open={paletteOpen}
              onOpenChange={setPaletteOpen}
              onOpenShortcuts={handleOpenShortcuts}
            />
          )}
        </Suspense>
      )}
    </RequireAuth>
  );
};
