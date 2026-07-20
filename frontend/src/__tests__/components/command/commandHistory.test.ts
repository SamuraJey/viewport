import { describe, it, expect, beforeEach } from 'vitest';
import {
  readCommandHistory,
  pushCommandHistory,
  clearCommandHistory,
  COMMAND_HISTORY_KEY,
  COMMAND_HISTORY_MAX,
} from '../../../components/command/commandHistory';

describe('commandHistory', () => {
  // The global jsdom localStorage mock (setupTests.ts) is the in-memory
  // source of truth — operate on it directly rather than spying on
  // Storage.prototype, which the mock bypasses.
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('readCommandHistory', () => {
    it('returns an empty array when no history exists', () => {
      expect(readCommandHistory()).toEqual([]);
    });

    it('returns parsed history from localStorage', () => {
      window.localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(['a', 'b']));
      expect(readCommandHistory()).toEqual(['a', 'b']);
    });

    it('returns an empty array when stored value is not an array', () => {
      window.localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify('not-an-array'));
      expect(readCommandHistory()).toEqual([]);
    });
  });

  describe('pushCommandHistory', () => {
    it('returns a single-element array for the first push', () => {
      expect(pushCommandHistory('a')).toEqual(['a']);
    });

    it('deduplicates an existing entry and prepends it', () => {
      pushCommandHistory('a');
      expect(pushCommandHistory('a')).toEqual(['a']);
    });

    it('prepends newest entry and preserves recency order', () => {
      pushCommandHistory('a');
      pushCommandHistory('b');
      expect(pushCommandHistory('c')).toEqual(['c', 'b', 'a']);
    });

    it('caps history at COMMAND_HISTORY_MAX entries', () => {
      const ids = ['1', '2', '3', '4', '5', '6'];
      for (const id of ids) {
        pushCommandHistory(id);
      }
      // After pushing 6 distinct, only the 5 newest (6,5,4,3,2) remain
      expect(pushCommandHistory('anything')).toEqual([
        'anything',
        '6',
        '5',
        '4',
        '3',
      ]);
      expect(COMMAND_HISTORY_MAX).toBe(5);
    });
  });

  describe('clearCommandHistory', () => {
    it('clears the stored history', () => {
      pushCommandHistory('a');
      pushCommandHistory('b');
      clearCommandHistory();
      expect(window.localStorage.getItem(COMMAND_HISTORY_KEY)).toBeNull();
      expect(readCommandHistory()).toEqual([]);
    });
  });
});
