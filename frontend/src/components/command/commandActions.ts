export const PENDING_ACTION_KEY = 'viewport:pending-action';

export type PendingAction = 'create-project';

export function requestCreateProject(navigate: (path: string) => void): void {
  try {
    sessionStorage.setItem(PENDING_ACTION_KEY, 'create-project');
  } catch {
    // sessionStorage unavailable — degrade gracefully
  }
  navigate('/dashboard');
}

export function consumePendingAction(): PendingAction | null {
  try {
    const value = sessionStorage.getItem(PENDING_ACTION_KEY);
    sessionStorage.removeItem(PENDING_ACTION_KEY);
    return value as PendingAction | null;
  } catch {
    return null;
  }
}
