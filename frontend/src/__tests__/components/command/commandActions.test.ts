import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  requestCreateProject,
  consumePendingAction,
  PENDING_ACTION_KEY,
} from '../../../components/command/commandActions';

describe('commandActions', () => {
  // The global jsdom sessionStorage mock (setupTests.ts) is the in-memory
  // source of truth — operate on it directly rather than spying on
  // Storage.prototype, which the mock bypasses.
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  describe('requestCreateProject', () => {
    it('sets the pending action in sessionStorage', () => {
      const navigate = vi.fn();
      requestCreateProject(navigate);
      expect(window.sessionStorage.getItem(PENDING_ACTION_KEY)).toBe('create-project');
    });

    it('navigates to /dashboard', () => {
      const navigate = vi.fn();
      requestCreateProject(navigate);
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  describe('consumePendingAction', () => {
    it('returns null when no action is pending', () => {
      expect(consumePendingAction()).toBeNull();
    });

    it('returns the pending action and clears the key', () => {
      window.sessionStorage.setItem(PENDING_ACTION_KEY, 'create-project');
      expect(consumePendingAction()).toBe('create-project');
      expect(window.sessionStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
    });

    it('returns null on subsequent calls', () => {
      window.sessionStorage.setItem(PENDING_ACTION_KEY, 'create-project');
      expect(consumePendingAction()).toBe('create-project');
      expect(consumePendingAction()).toBeNull();
    });
  });
});
