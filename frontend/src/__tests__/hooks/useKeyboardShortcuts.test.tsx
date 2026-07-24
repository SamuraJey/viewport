import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Helper to dispatch a synthetic KeyboardEvent on the current active element so
// event.target resolves to the focused input (typing guard) or body otherwise.
const keydown = (init: KeyboardEventInit) => {
  const target =
    document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true }));
};

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  afterEach(() => {
    // Clear any pending go timeout so tests don't leak
    vi.restoreAllMocks();
  });

  const render = (options?: Parameters<typeof useKeyboardShortcuts>[0]) =>
    renderHook(() => useKeyboardShortcuts(options), {
      wrapper: MemoryRouter,
    });

  // ── Shortcuts overlay ──────────────────────────────────────────

  it('opens the shortcuts overlay on ?', () => {
    const { result } = render({ enabled: true });
    act(() => keydown({ key: '?' }));
    expect(result.current.isOpen).toBe(true);
  });

  it('closes the shortcuts overlay on Escape when open', () => {
    const { result } = render({ enabled: true });
    act(() => keydown({ key: '?' }));
    expect(result.current.isOpen).toBe(true);
    act(() => keydown({ key: 'Escape' }));
    expect(result.current.isOpen).toBe(false);
  });

  it('does NOT open the shortcuts overlay when disabled', () => {
    const { result } = render({ enabled: false });
    act(() => keydown({ key: '?' }));
    expect(result.current.isOpen).toBe(false);
  });

  // ── Go-navigation ──────────────────────────────────────────────

  it('navigates to /dashboard on g then d', () => {
    const { result } = render({ enabled: true });
    act(() => keydown({ key: 'g' }));
    act(() => keydown({ key: 'd' }));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    expect(result.current.isOpen).toBe(false);
  });

  it('navigates to /share-links on g then s', () => {
    const { result } = render({ enabled: true });
    act(() => keydown({ key: 'g' }));
    act(() => keydown({ key: 's' }));
    expect(mockNavigate).toHaveBeenCalledWith('/share-links');
    expect(result.current.isOpen).toBe(false);
  });

  it('does NOT navigate when only g is pressed', () => {
    const { result } = render({ enabled: true });
    act(() => keydown({ key: 'g' }));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);
  });

  // ── Command palette (Cmd/Ctrl+K) ───────────────────────────────

  it('toggles paletteOpen on Cmd+K', () => {
    const { result } = render({ enabled: true });
    act(() => keydown({ key: 'k', metaKey: true }));
    expect(result.current.paletteOpen).toBe(true);
    act(() => keydown({ key: 'k', metaKey: true }));
    expect(result.current.paletteOpen).toBe(false);
  });

  it('toggles paletteOpen on Ctrl+K (Windows/Linux)', () => {
    const { result } = render({ enabled: true });
    act(() => keydown({ key: 'k', ctrlKey: true }));
    expect(result.current.paletteOpen).toBe(true);
    act(() => keydown({ key: 'k', ctrlKey: true }));
    expect(result.current.paletteOpen).toBe(false);
  });

  it('toggles paletteOpen on Cmd+Shift+K (uppercase K)', () => {
    const { result } = render({ enabled: true });
    act(() => keydown({ key: 'K', metaKey: true }));
    expect(result.current.paletteOpen).toBe(true);
    act(() => keydown({ key: 'K', metaKey: true }));
    expect(result.current.paletteOpen).toBe(false);
  });

  it('closes shortcuts dialog when Cmd+K toggles while isOpen', () => {
    const { result } = render({ enabled: true });
    act(() => keydown({ key: '?' }));
    expect(result.current.isOpen).toBe(true);
    act(() => keydown({ key: 'k', metaKey: true }));
    expect(result.current.isOpen).toBe(false);
    expect(result.current.paletteOpen).toBe(true);
  });

  it('closes palette on Escape when palette is open', () => {
    const { result } = render({ enabled: true });
    act(() => keydown({ key: 'k', metaKey: true }));
    expect(result.current.paletteOpen).toBe(true);
    act(() => keydown({ key: 'Escape' }));
    expect(result.current.paletteOpen).toBe(false);
    // isOpen should be unaffected
    expect(result.current.isOpen).toBe(false);
  });

  it('closes palette on Escape (not shortcuts) when both are open', () => {
    const { result } = render({ enabled: true });
    // Open the palette first, then the shortcuts overlay — Cmd+K closes the
    // shortcuts dialog by design, so this is the only order that yields both open.
    act(() => keydown({ key: 'k', metaKey: true }));
    expect(result.current.paletteOpen).toBe(true);
    act(() => keydown({ key: '?' }));
    expect(result.current.isOpen).toBe(true);
    // Escape closes palette first
    act(() => keydown({ key: 'Escape' }));
    expect(result.current.paletteOpen).toBe(false);
    expect(result.current.isOpen).toBe(true);
    // Second Escape closes shortcuts
    act(() => keydown({ key: 'Escape' }));
    expect(result.current.isOpen).toBe(false);
  });

  // ── Cmd+K works while typing ───────────────────────────────────

  it('Cmd+K toggles paletteOpen even while typing in an input', () => {
    const { result } = render({ enabled: true });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => keydown({ key: 'k', metaKey: true }));
    expect(result.current.paletteOpen).toBe(true);

    act(() => keydown({ key: 'k', metaKey: true }));
    expect(result.current.paletteOpen).toBe(false);

    document.body.removeChild(input);
  });

  // ── Typing guard: navigation shortcuts do NOT fire while typing ─

  it('g then d does NOT navigate while typing in an input', () => {
    const { result } = render({ enabled: true });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => keydown({ key: 'g' }));
    act(() => keydown({ key: 'd' }));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);

    document.body.removeChild(input);
  });

  it('? does NOT open shortcuts while typing', () => {
    const { result } = render({ enabled: true });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => keydown({ key: '?' }));
    expect(result.current.isOpen).toBe(false);

    document.body.removeChild(input);
  });

  // ── Callback shortcuts ─────────────────────────────────────────

  it('calls onNewProject on n when not typing', () => {
    const onNewProject = vi.fn();
    render({ enabled: true, onNewProject });
    act(() => keydown({ key: 'n' }));
    expect(onNewProject).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onNewProject on n while typing', () => {
    const onNewProject = vi.fn();
    render({ enabled: true, onNewProject });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => keydown({ key: 'n' }));
    expect(onNewProject).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('calls onUpload on u when not typing', () => {
    const onUpload = vi.fn();
    render({ enabled: true, onUpload });
    act(() => keydown({ key: 'u' }));
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it('calls onFocusSearch on / when not typing', () => {
    const onFocusSearch = vi.fn();
    render({ enabled: true, onFocusSearch });
    act(() => keydown({ key: '/' }));
    expect(onFocusSearch).toHaveBeenCalledTimes(1);
  });

  // ── Return value defaults ──────────────────────────────────────

  it('returns expected shape with default values', () => {
    const { result } = render();
    expect(result.current).toHaveProperty('isOpen', false);
    expect(result.current).toHaveProperty('setIsOpen');
    expect(result.current).toHaveProperty('paletteOpen', false);
    expect(result.current).toHaveProperty('setPaletteOpen');
  });
});
