const DEMO_MODE_STORAGE_KEY = 'viewport-demo-mode';

const getWindow = (): Window | null => {
  return typeof window !== 'undefined' ? window : null;
};

const getStoredDemoMode = (): boolean => {
  const win = getWindow();
  if (!win) return false;

  try {
    return win.localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

export const isDemoModeEnabled = (): boolean => {
  return import.meta.env.VITE_DEMO_MODE === 'true' || getStoredDemoMode();
};

export const enableDemoMode = (): void => {
  const win = getWindow();
  if (!win) return;

  try {
    win.localStorage.setItem(DEMO_MODE_STORAGE_KEY, 'true');
  } catch {
    // Ignore storage write errors in private mode.
  }
};

export const disableDemoMode = (): void => {
  const win = getWindow();
  if (!win) return;

  try {
    win.localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
  } catch {
    // Ignore storage write errors in private mode.
  }
};
