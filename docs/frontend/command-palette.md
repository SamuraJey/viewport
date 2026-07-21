# Command palette (Cmd/Ctrl+K)

Implements [RFC 003](../rfcs/rfc-003-command-palette.md). A global, keyboard-first
command palette for authenticated users, built on [`cmdk`](https://cmdk.paco.me/).

## What it does

- **`Cmd+K` (mac) / `Ctrl+K` (win/linux)** opens the palette from anywhere inside
  the protected app — including while typing in an input or while another modal is
  open. Pressing it again closes it.
- **Fuzzy search** across static commands plus dynamic results (recent projects,
  active share links). `cmdk` handles filtering against each item's label and
  `keywords`.
- **Sections**: Recent (last 5 executed static commands), Navigation, Actions,
  Recent projects, Active share links, Theme, Settings. Dynamic sections only
  render when they have results.
- **`Esc`** closes the palette. When both the palette and the keyboard-shortcuts
  overlay are open, the first `Esc` closes the palette and the second closes the
  shortcuts overlay.
- **`?`** still opens the keyboard-shortcuts overlay (from RFC 002); the palette
  entry is now listed there as `⌘ K` / `Ctrl K`.
- **History**: the last 5 executed *static* commands are persisted in
  `localStorage['viewport-cmd-history']` and shown in a "Recent" section when the
  search field is empty.

## Architecture

```
frontend/src/
├── components/command/
│   ├── CommandRegistry.ts      # Command type + createStaticCommands(perf)
│   ├── CommandItem.tsx         # single cmdk Command.Item (icon/label/shortcut)
│   ├── CommandPalette.tsx      # AppDialog + cmdk Command, sections, history
│   ├── commandActions.ts       # cross-page pending-action bridge (sessionStorage)
│   └── commandHistory.ts       # localStorage recency log (max 5)
├── hooks/
│   ├── useKeyboardShortcuts.ts # global shortcuts; owns paletteOpen state
│   └── useCommandItems.ts      # fetches top-5 projects + active share links
```

### Command contract

`CommandRegistry.ts` exports the `Command` shape and `createStaticCommands`:

```ts
export interface Command {
  id: string;
  label: string;
  group: 'navigation' | 'actions' | 'settings' | 'theme';
  icon: LucideIcon;
  shortcut?: string[];
  keywords?: string[];
  perform: () => void | Promise<void>;
}
```

Static commands (8, in order): `go-dashboard`, `go-share-links`, `new-project`,
`focus-search`, `toggle-theme`, `open-shortcuts`, `go-accessibility`, `sign-out`.
Each receives a `CommandPerformers` closure bundle (`navigate`, `toggleTheme`,
`focusSearch`, `openShortcuts`, `signOut`) so the registry stays pure and the
palette wires real handlers at render time.

### Dynamic data

`useCommandItems({ enabled })` fetches, in parallel:
- `projectService.getProjects(1, 5, { sort_by: 'created_at', order: 'desc' })`
- `shareLinkService.getOwnerShareLinks(1, 5, undefined, 'active')`

Results are mapped to `Command[]` (`project:<id>` / `sharelink:<id>`). Fetching is
gated on `enabled` (the palette's `open` prop) so no requests fire while closed,
and a cancellation guard drops stale responses after unmount/close. Services
already branch through demo mode internally, so the palette works in demo mode
without special handling.

### Cross-page "new project" bridge

The `new-project` command must open the create-project modal, which lives in
`DashboardPage.tsx`. The palette navigates to `/dashboard` and stashes a pending
action in `sessionStorage` (`viewport:pending-action` = `create-project`) via
`commandActions.ts`. `DashboardPage` consumes the pending action on mount (with a
ref guard so it runs once) and calls `handleOpenProjectModal()`. This keeps the
modal ownership in `DashboardPage` while letting the palette trigger it from any
page.

## Global shortcuts (`useKeyboardShortcuts`)

The hook (originally from RFC 002) owns both overlay states and returns:

```ts
{ isOpen, setIsOpen, paletteOpen, setPaletteOpen }
```

Handler order (each early-returns):
1. `Cmd/Ctrl+K` — toggles `paletteOpen`; if the shortcuts overlay is open it
   closes it. Runs **before** the typing/modal guards so it always works.
2. `Escape` when `paletteOpen` — closes the palette (before the shortcuts-overlay
   Escape handler).
3. `Escape` when `isOpen` — closes the shortcuts overlay.
4. Typing guard: shortcuts that follow are suppressed when the active element is
   an `input`, `textarea`, `select`, or `[contenteditable="true"]`.
5. Modal guard: remaining shortcuts are suppressed while a
   `[role="dialog"][aria-modal="true"]` is in the DOM.
6. `?`, `g d`, `g s`, `n`, `u`, `/` — unchanged from RFC 002.

The `event.target` typing guard uses `target instanceof Element && target.matches(...)`
so events targeting non-Element nodes (e.g. `document` itself) don't throw.

## Wiring

- `App.tsx` `ProtectedLayout`: calls `useKeyboardShortcuts({ enabled: isAuthenticated })`,
  passes `onOpenCommandPalette={() => setPaletteOpen(true)}` to `Layout`, and
  renders `<CommandPalette>` statically (not lazy — the palette must open with
  zero JIT-load latency, per the RFC `<100ms` acceptance criterion) alongside
  `<KeyboardShortcutsDialog>`.
- `Layout.tsx`: renders a "Quick search" trigger button (`hidden md:inline-flex`)
  between the header divider and the utilities, with a platform-aware kbd hint
  (`⌘K` on mac, `Ctrl K` elsewhere). Hidden on mobile where the palette is
  awkward; the keyboard shortcut still works on mobile keyboards that support it.
- `KeyboardShortcutsDialog.tsx`: lists `⌘ K` / `Ctrl K` → "Open command palette"
  as the first entry.

## Theming

The palette uses `AppDialog` (backdrop, focus trap, motion) wrapping a `cmdk`
`Command`. All colors use the existing semantic tokens (`bg-surface`,
`bg-surface-1`, `text-text`, `text-muted`, `border-border`, `bg-accent`, plus
`dark:` variants) so it adapts to the light/dark theme automatically. No
hardcoded RGB. Active items are styled via cmdk's `data-[selected=true]`
attribute.

## Testing

- `useKeyboardShortcuts.test.tsx` — keyboard-event dispatch on the active element
  (so the typing guard sees focused inputs); covers `?`, `Esc`, `g d`, `g s`,
  `n`/`u`/`/`, Cmd/Ctrl+K toggle, palette-Escape precedence, typing-guard
  suppression, disabled state.
- `useCommandItems.test.tsx` — mocks `projectService`/`shareLinkService`, asserts
  mapping to `Command[]` and that disabled mode issues no requests.
- `CommandPalette.test.tsx` — renders the open palette, asserts sections, dynamic
  data, fuzzy filtering (`dash` → dashboard), and `onOpenChange(false)` on select.
- `commandHistory.test.ts` / `commandActions.test.ts` — recency/dedup/cap and the
  sessionStorage pending-action round-trip. Both operate on the global jsdom
  storage mocks directly (see `src/setupTests.ts`).

`src/setupTests.ts` mocks `Element.prototype.scrollIntoView` (jsdom does not
implement it; `cmdk` calls it on the active item).

## Related

- RFC: [003 — Command palette](../rfcs/rfc-003-command-palette.md)
- Sibling: [002 — A11y improvements](../rfcs/rfc-002-a11y-improvements.md)
  (`useKeyboardShortcuts` + `KeyboardShortcutsDialog` originated here)
- Frontend primitives: [Headless UI primitives](./headless-ui-primitives.md)
  (`AppDialog`)
