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
