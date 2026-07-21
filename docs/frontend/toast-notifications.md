# Toast notifications (`sonner`)

Implements [RFC 004](../rfcs/rfc-004-toast-notifications.md). Success, error,
warning, and info feedback via [`sonner`](https://sonner.emilkowal.ski/) toasts,
replacing silent `setError(...)` + `<ErrorDisplay>` patterns for non-validation
actions.

## What it does

- **`toast.success`** — confirms completed actions (profile saved, photo deleted,
  share link created, photo renamed, cover updated, download started).
- **`toast.error`** — surfaces API failures with the server's error message.
- **`toast.warning`** — partial results (some files uploaded, some failed).
- **`toast.info`** — informational edge cases (photo was already deleted).
- **Stacking** — sonner manages the toast queue; default 3 visible, 4s duration,
  `closeButton` on every toast.
- **Theming** — the `<Toaster>` reads `useThemeStore` so toasts follow the user's
  light/dark preference. Rich colors differentiate success/error/warning.
- **Accessibility** — sonner renders `role="status"` + `aria-live="polite"` by
  default; screen readers announce toast content.

## Architecture

```
frontend/src/
├── components/
│   └── AppToaster.tsx          # <Toaster> wired to themeStore, semantic-token classNames
├── main.tsx                    # mounts <AppToaster /> once at the root
├── hooks/
│   ├── useProfileActions.ts    # toast.success/error on profile save + password change
│   └── useGalleryActions.ts    # toast.success/error/info on 12 gallery action handlers
└── components/
    ├── PhotoRenameModal.tsx    # toast.success on rename, toast.error on API failure
    └── PhotoUploadConfirmModal.tsx  # toast.success/warning/error on upload result close
```

### AppToaster

`AppToaster` wraps sonner's `<Toaster>` and wires it to the app's theme store:

```tsx
<Toaster
  theme={theme}           // 'light' | 'dark' from useThemeStore
  position="bottom-right"
  richColors               // colorful success/error/warning variants
  closeButton              // explicit dismiss affordance
  duration={4000}          // RFC spec: 4 seconds
  toastOptions={{
    classNames: {
      toast: 'rounded-2xl border border-border/50 bg-surface/95 ...',
      title: 'text-text font-semibold',
      description: 'text-muted',
      ...
    },
  }}
/>
```

Mounted once in `main.tsx` after `<App />`, inside `<BrowserRouter>`.

## Migration rules (per RFC)

- **Replaced with toasts**: API success/failure feedback for profile updates,
  password changes, photo rename/delete, share link CRUD, gallery delete, cover
  photo set/clear, downloads, upload results.
- **NOT replaced (kept inline)**: form-validation errors (e.g. "New password and
  confirmation do not match", "Filename must contain valid characters"). These
  stay as `setError(...)` rendered inline next to the field, per the RFC:
  "Не заменять: критичные form-validation ошибки".
- **Existing `handleError(err)` preserved**: gallery action handlers still call
  `handleError` for page-level error state; toasts are added *alongside*, not
  replacing, so the error banner and toast both fire.

## Usage

```tsx
import { toast } from 'sonner';

// Success
toast.success('Photo renamed', { description: 'Renamed to portrait-final.jpg' });

// Error
toast.error('Failed to update profile');

// Warning (partial result)
toast.warning('Partial upload', { description: '20 uploaded, 4 failed.' });

// Info
toast.info('Photo was already deleted');
```

## Testing

Toast integration tests mock `sonner` via `vi.hoisted()` (required because
`vi.mock` factories are hoisted above variable declarations):

```tsx
const { toastMock } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn(), ... },
}));
vi.mock('sonner', () => ({ toast: toastMock }));
```

Test files:
- `useProfileActions.test.tsx` — 5 tests: success/error on profile save,
  success/error on password change, inline validation mismatch (no toast).
- `useGalleryActions.test.tsx` — 3 tests: share link creation success/error,
  photo rename success.
- `PhotoRenameModal.test.tsx` — 1 test: asserts `toast.success('Photo renamed')`
  after successful rename.

## Related

- RFC: [004 — Toast notifications](../rfcs/rfc-004-toast-notifications.md)
- Related RFCs: [001 Visual foundation](../rfcs/rfc-001-visual-foundation.md)
  (semantic tone tokens), [008 Photo upload UX](../rfcs/rfc-008-photo-upload-ux.md)
  (promise toast use case), [009 Public gallery](../rfcs/rfc-009-public-gallery-experience.md)
  (`toast.success('Selection submitted')`).
- External: [sonner docs](https://sonner.emilkowal.ski/)
