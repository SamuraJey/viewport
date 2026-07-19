export const COMMAND_HISTORY_KEY = 'viewport-cmd-history';

export const COMMAND_HISTORY_MAX = 5;

export function readCommandHistory(): string[] {
  try {
    const raw = localStorage.getItem(COMMAND_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushCommandHistory(id: string): string[] {
  try {
    const current = readCommandHistory();
    const deduped = current.filter((entry) => entry !== id);
    const updated = [id, ...deduped].slice(0, COMMAND_HISTORY_MAX);
    localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function clearCommandHistory(): void {
  try {
    localStorage.removeItem(COMMAND_HISTORY_KEY);
  } catch {
    // localStorage unavailable — degrade gracefully
  }
}
