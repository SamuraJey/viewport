# Gallery sorting controls

The owner gallery photo toolbar has two matching controls:

- **My view** changes the private photo order. Sorting remains URL-synced and resets pagination to the first page.
- **Public view** changes the persisted gallery order seen by visitors through direct gallery and project share links.

Both controls display short summaries of their current order (for example, `Name A–Z` or `Size ↑`); accessible names and menu choices retain full descriptions. Opening either shows all six choices directly, grouped into filename, date, and size pairs. Choosing an option closes the popover; public changes save automatically, with a saving indicator on the trigger. The public control disables choices while a save is pending. Selecting the current choice closes the menu without saving again.

The controls share `GallerySortControl`, use `AppPopover` for positioning and focus, and expose selected options as pressed buttons. Keyboard users can tab through choices and activate them with Enter or Space; Escape closes the popover. The existing `gallery:open-public-sort` event still opens the public control.

This changes owner controls only; public visitors cannot adjust the photographer's sorting.
