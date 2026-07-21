# Drawer editors

Viewport uses `AppDrawer` (`frontend/src/components/ui/AppDrawer.tsx`) for editing flows that benefit from preserving page context. Confirmation dialogs and compact, centered tasks continue to use `AppDialog`.

## Responsive behavior

- Without an explicit `side`, drawers open from the right at `md` and larger, and as bottom sheets below `md`.
- Desktop widths are `sm` = 384px, `md` = 480px, and `lg` = 640px. Side drawers use `100dvh` and keep scrolling inside the drawer body.
- Bottom sheets default to the full snap point. Pass `snapPoints` for staged sheets, such as the public gallery share sheet (`[0.5, 0.9]`).
- `side="left"` and `side="bottom"` are explicit overrides. Desktop side drawers do not expose drag-to-close; bottom sheets do.

## Accessibility and composition

`AppDrawer` delegates dialog semantics, focus trapping, Escape dismissal, outside-click dismissal, and drag gestures to Vaul/Radix. It always renders a `Drawer.Title`; descriptions use `Drawer.Description`. Pass `initialFocusRef` for the first editor field. Focus returns to the element that was active before opening.

Use `canClose={false}` while a save is in flight. `AppDrawerSection` provides a consistent bordered section for grouped form content. For a drawer opened from another drawer, render it inside the parent and pass `nested` so it uses `Drawer.NestedRoot`.

## Current drawer surfaces

- Photo rename (`sm`)
- Create project (`sm`)
- Profile and account settings (`md`)
- Share-link creation and editing (`lg`, sticky tab list)
- Public gallery share sheet (bottom, staged snap points, nested QR code handoff)

The public share sheet keeps the photographer-selected public light/dark scheme by applying the gallery theme scope to the portalled drawer content. Its QR is generated locally as an SVG with `react-qr-code`; public URLs are rebuilt from the share and gallery IDs so selection resume tokens and arbitrary query parameters never enter copy, email, SMS, or QR handoffs.

## Testing

`AppDrawer.test.tsx` covers mobile and desktop direction, explicit left placement, autofocus, focus trapping, overlay dismissal, Escape close with focus restoration (including conditionally mounted drawers), and nested drawers. Public gallery tests cover the nested QR surface and prevent selection resume-token disclosure. `setupTests.ts` supplies jsdom's missing Pointer Events capture methods so Vaul drag handlers can be exercised without browser-only errors.
