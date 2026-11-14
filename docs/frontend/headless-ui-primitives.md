# Headless UI primitives

Viewport uses `Tailwind CSS` for styling and `Headless UI` for accessible interactive primitives.

## Default primitives
- `AppDialog` for all modal dialogs.
- `AppTabs` for keyboard-accessible tab groups backed by string keys.
- `AppSwitch` for binary settings that behave like switches.
- `AppPopover` for anchored floating panels.

## Usage rules
- New dialogs must not reimplement focus trap, escape handling, scroll locking, or focus restore.
- New tab groups must not hand-roll `role="tablist"`, `role="tab"`, or `role="tabpanel"`.
- Use `Framer Motion` only as an animation layer on top of these primitives.
- Keep native `<select>` and standard form checkboxes unless a custom interaction genuinely requires `Listbox`, `Combobox`, or `Switch`.
- Prefer shared wrappers from `frontend/src/components/ui/` over direct `@headlessui/react` usage in feature components.

## Popover focus and scrolling

Anchored `AppPopover` panels render in a portal and are positioned asynchronously.
When `panelFocus` is enabled, initial focus moves to the first enabled action only
after the opening animation completes. This prevents the browser from scrolling
to the portal's temporary position when opening project actions near the bottom
of the dashboard. Headless UI continues to handle Escape, focus restoration, and
closing when focus leaves the panel.

To verify, scroll to a project near the bottom, open its actions with both a
pointer and Enter, and confirm that the page stays in place and the menu remains
visible. Escape must close it and return focus to the trigger; reopening must
preserve the same behavior.
