import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { consumePendingAction, type PendingAction } from '../components/command/commandActions';

/**
 * Consumes a pending command-palette action on navigation.
 *
 * The command palette stashes a pending action in `sessionStorage` and
 * navigates to a target page (e.g. "create-project" → `/dashboard`). Because
 * same-path navigations do not remount the route component, this hook keys
 * consumption on `location.key` (which changes on every PUSH navigation,
 * including same-path) instead of running only on mount. The guard is scoped
 * per location key so the action fires once per navigation without repeating
 * on unrelated re-renders.
 */
export function usePendingAction(onConsume: (action: PendingAction) => void): void {
  const location = useLocation();
  const onConsumeRef = useRef(onConsume);
  onConsumeRef.current = onConsume;
  const consumedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (consumedKeyRef.current === location.key) return;
    consumedKeyRef.current = location.key;
    const action = consumePendingAction();
    if (action) {
      onConsumeRef.current(action);
    }
  }, [location.key]);
}
