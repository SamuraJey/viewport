# Mobile owner workspace

The photographer workspace uses the same project, gallery, upload and share-link
flows on phones and desktop. Mobile forms must remain usable with browser chrome
and a software keyboard taking up part of the screen.

## Overlay sizing and scrolling

- `useOverlayViewport` measures `VisualViewport.height` and `offsetTop` while an
  overlay is open. It listens to resize and scroll, removes listeners on close,
  and leaves pinch zoom to the browser. Browsers without this API use CSS sizing.
- `AppDialog` has a scrollable visible-viewport container. Short dialogs remain
  centered; tall dialogs start at the top and can scroll through their actions.
  Keep scrolling on this container even when a panel clips its rounded corners.
- Owner `AppDrawer` sheets use content height up to the visible viewport minus
  12px. Their body scrolls independently of the header and action footer. The
  header is bounded on short screens, and resize keeps the focused field visible.
  The outer drawer uses `overflow: clip`, not `hidden`: it must never become a
  programmatic scroll container when the browser brings a lower input into view.
  Desktop panels use the same keyboard-aware bounds.
- Owner sheets drag from the handle only, so scrolling forms and manipulating
  controls cannot accidentally drag the entire sheet. Vaul still owns focus,
  modal behavior, dismissals, and nesting. Its input repositioning is disabled
  for these sheets to avoid two competing height/position calculations.
- Explicit snap-point consumers (the public share drawer) retain Vaul's snap and
  keyboard behavior. Do not add snap points to owner forms without testing their
  interaction with keyboard resizing.
- Overlay padding respects safe-area insets. Inputs, textareas and selects in
  owner pages and overlays use at least 16px on phones to avoid input focus zoom
  in iOS; user zoom remains enabled.
- Mobile owner overlays do not autofocus text fields when opened. Focus starts on
  the dialog or sheet so the photographer can understand the form before choosing
  a field and opening the software keyboard. Fine-pointer desktop layouts retain
  field autofocus. When a mobile field is focused, owner sheet headers collapse to
  a single short title; icons, eyebrows and explanatory copy stay out of the small
  visible area.

## Compact layouts

Project creation omits promotional feature cards on phones, and drawer sections
become flat forms without nested card headers. Project rename and gallery creation use smaller mobile padding and wrapping
action rows. Share-link save/cancel actions share one row when space allows.
Appearance previews have narrower mobile gutters and a width-bounded phone
preview. Popovers are width-bounded and use anchor padding at screen edges.

## Verification

Automated tests cover viewport resize/panning, keyboard dismissal, pinch zoom,
API absence and listener cleanup, plus existing focus, dismissal, nesting and
share-link form behavior. Browser checks use local demo data at phone widths
including 320px and reduced heights. Desktop emulation does not reproduce a real
iOS/Android keyboard; physical-device verification remains useful for browser
scroll and keyboard animation differences.

Manual regression flow: create a project, add a gallery, rename each, edit
appearance and cover, then create/edit a share link with a password and custom
expiry. Focus lower fields, open/close the keyboard, scroll to actions, rotate
the phone, and repeat in both themes. Also check photo upload review and nested
confirmation dialogs, with long names and increased text size.
