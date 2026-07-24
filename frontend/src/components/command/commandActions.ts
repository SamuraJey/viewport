export const PENDING_ACTION_KEY = 'viewport:pending-action';

export type PendingAction = 'create-project' | 'create-gallery' | 'project-settings';

export function requestCreateProject(navigate: (path: string) => void): void {
  try {
    sessionStorage.setItem(PENDING_ACTION_KEY, 'create-project');
  } catch {
    // sessionStorage unavailable — degrade gracefully
  }
  navigate('/dashboard');
}

export function requestProjectAction(
  navigate: (path: string) => void,
  projectId: string,
  action: Exclude<PendingAction, 'create-project'>,
): void {
  try {
    sessionStorage.setItem(PENDING_ACTION_KEY, action);
  } catch {
    // sessionStorage unavailable — the project page still opens.
  }
  navigate(`/projects/${projectId}`);
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
