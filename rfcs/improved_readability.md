# RFC: accessibility hardening + mandatory low-vision mode for Viewport

## Status
Approved for implementation.

## Goal
Bring the Viewport frontend to a practically usable accessibility baseline aligned with **ГОСТ Р 52872-2019** with **AA as the target level**, and add a **mandatory dedicated low-vision mode** for users with reduced vision.

This RFC fixes scope ambiguity from the previous version and locks the implementation decisions that should be treated as final unless explicitly changed later.

## Product goals
We are solving **two parallel but related tasks**:

1. **Make the default application significantly more accessible overall**
   - semantic structure
   - keyboard access
   - focus visibility
   - labels and names
   - accessible dialogs
   - page titles
   - screen-reader compatibility
   - better form UX

2. **Add a dedicated low-vision mode** according to the practical expectations of ГОСТ / WCAG-based accessibility work
   - high-contrast themes
   - larger text
   - larger interactive targets
   - increased spacing / readability controls
   - persistent user preferences

## Standards and target compliance
Primary standard:
- **ГОСТ Р 52872-2019** — requirements for accessibility of digital content and user interfaces

Reference basis used by the standard:
- **WCAG 2.1** (the standard is based on it)
- for modern interpretation and implementation details we may also rely on **WCAG 2.2** where it improves implementation quality and does not conflict with the standard

Target compliance:
- **Level AA** is the target
- AAA is not the delivery target
- if a requirement cannot be fully satisfied in this iteration, the implementation should move in the correct architectural direction and explicitly document the gap

## Locked decisions
These decisions are now fixed for implementation.

### 1. Scope is broad and includes code + docs + tooling
This task includes:
- frontend implementation
- accessibility documentation
- readability / accessibility linters
- automated accessibility checks where useful

This task does **not** stop at visual tweaks.

### 2. Existing a11y work is not automatically accepted
If something is already implemented, it must be:
- checked for quality
- kept if good enough
- finished or rewritten if weak / inconsistent / incomplete

### 3. Photo alt text source
For gallery photos, the canonical accessible text source is:
- **`photo display name`**
- fallback: filename
- fallback of last resort: stable generic English label only if no name exists

We should **not** keep `Photo {id}` as the main alt pattern where a display name is available.

### 4. Low-vision mode is mandatory
The previous RFC called it optional. That is no longer valid.

The project **must** ship a dedicated low-vision mode.

### 5. Target locale
The target UI locale is **English**.

Implications:
- route/page titles should be in English
- aria labels should be in English
- accessibility documentation page should be in English
- `lang="en"` remains the default root language
- foreign-language fragments may use local `lang` attributes only where actually needed

### 6. Route titles must be implemented
There is currently no coherent page-title strategy.

We will implement one centralized and maintainable approach for route-level `document.title` updates.

### 7. Reusable accessible primitives are preferred
Where accessibility behavior repeats, we should prefer reusable primitives over ad hoc fixes.

Highest priority candidate:
- reusable accessible dialog/modal pattern with:
  - proper `role="dialog"`
  - `aria-modal`
  - labelled title/description
  - focus trap
  - initial focus
  - escape handling
  - focus restore on close
  - safe backdrop click behavior

### 8. Infinite scroll fallback is not required for this RFC
For the current gallery behavior, we are **not** treating this as a blocking requirement in this RFC.

Do not spend implementation time on a keyboard fallback for infinite scroll here.

### 9. 44×44 target size rule
Increasing target sizes to at least 44×44 is **required in low-vision mode**.

It is **not** required to globally enlarge all controls in the default theme if that would unnecessarily disrupt the main UI.

### 10. Accessibility page is required
We need a dedicated accessibility page.

### 11. Feedback form is not required
A separate accessibility feedback form is **out of scope** for this RFC.

### 12. PR checklist changes are not required
Updating PR templates/checklists is **out of scope** for this RFC.

### 13. axe / Lighthouse
They are optional implementation aids, but recommended if they improve development and verification of the new mode.

## Current repo findings that affect implementation
Based on inspection of the current frontend:

### Already present, but uneven
- `lang="en"` already exists in `frontend/index.html`
- many controls already have `aria-label`
- some tabs already use `role="tablist"`, `role="tab"`, `role="tabpanel"`
- focus styles exist in many places via `focus-visible:*`
- some live regions already exist

### Important gaps
- photo alt text often still uses weak placeholders like `Photo {id}`
- dialogs/modals are inconsistent: some restore focus, some do not
- no reusable dialog foundation exists yet
- page title management is effectively absent
- `eslint-plugin-jsx-a11y` is installed but not enabled in ESLint config
- the public gallery “start selection” modal is notably weak semantically
- low-vision mode does not exist

## Implementation scope

### In scope

#### A. Default-mode accessibility hardening
- semantic structure improvements
- skip link
- route/page titles
- better labels and descriptions
- robust keyboard access
- consistent focus handling
- accessible forms and validation states
- accessible modal/dialog behavior
- better screen-reader output for dynamic UI
- accessible names for icon-only actions
- accessible photo naming

#### B. Dedicated low-vision mode
- toggle from app UI
- persistent preferences in `localStorage`
- high-contrast palettes
- text scaling
- spacing controls
- larger pointer targets
- stronger focus indicators
- system-wide application through shared tokens / root attributes

#### C. Documentation
- dedicated accessibility page
- low-vision mode explanation
- keyboard shortcut summary
- declared target compliance level and known limitations

#### D. Tooling and validation
- enable JSX accessibility linting
- add automated accessibility checks where useful
- run keyboard/manual verification passes

### Out of scope for this RFC
- dedicated accessibility feedback form
- PR template / PR checklist changes
- user-research recruitment workflow
- media subtitles / audio descriptions for content types that do not currently exist in the product
- speech-recognition-specific optimization as a separate deliverable

## Architecture direction

### 1. Accessibility foundation layer
Introduce a small shared accessibility foundation for the frontend.

Expected building blocks:
- route title helper or hook
- reusable dialog/modal primitive
- reusable visually-hidden utility usage (`sr-only` pattern)
- shared live-region patterns where needed
- shared readability-mode store / provider / root attribute handling

### 2. Readability mode should be token-driven
Low-vision mode should be implemented through **root-level state + theme tokens / data attributes / CSS variables**, not by patching dozens of components independently.

Preferred approach:

- add a root attribute like `data-readability-mode="on"`
- add additional root attributes for preferences, for example:
  - `data-readability-font-scale`
  - `data-readability-contrast`
  - `data-readability-spacing`
- drive the UI through shared CSS variables and Tailwind-compatible class strategy where practical

Do **not** build the mode as a disconnected duplicate interface.

## Detailed requirements

## 1. Perceivable

### 1.1 Text alternatives
Required:
- all informative images must have meaningful `alt`
- gallery photos must use **display photo name** as their accessible text source
- icon-only buttons must have accessible names
- decorative icons/images should be hidden from assistive tech where appropriate

Implementation notes:
- photo thumbnails in internal and public galleries must stop using `Photo {id}` when display name exists
- lightbox slides should inherit the same naming strategy
- image-error placeholders should still expose understandable action context

### 1.2 Contrast and color
Required in the default UI:
- visible focus indicators
- avoid conveying meaning by color alone
- remove obvious low-contrast failures where discovered

Required in low-vision mode:
- text contrast target suitable for AA
- component/outline contrast target suitable for AA usage patterns
- stronger focus styling than default mode
- contrast should be solved systemically through theme tokens

### 1.3 Scaling and readability
Required:
- content remains usable at 200% zoom
- layout remains functional at narrow widths such as 320px
- readability controls exist in low-vision mode

Low-vision mode controls must include:
- font size: `100%`, `125%`, `150%`, `200%`
- line spacing presets
- optional letter/word spacing adjustments if needed to make the implementation coherent

## 2. Operable

### 2.1 Keyboard access
Required:
- all functionality usable without a mouse
- correct tab order
- visible focus for all interactive controls
- `Escape` closes dismissible dialogs/popovers where appropriate
- tabs should be keyboard-usable
- modal focus must remain inside the modal while open
- focus must return to the invoking control after close

Important hotspots in current UI:
- create gallery modal
- confirmation modal
- upload confirmation modal
- profile modal
- photo rename modal
- public gallery start-selection modal

### 2.2 Navigation and orientation
Required:
- global skip link to main content
- clear landmarks (`header`, `nav`, `main`, etc.)
- correct heading hierarchy
- route/page titles for every main page
- current-page indication in navigation where relevant

Decision:
- breadcrumbs are not required as a dedicated deliverable unless they become naturally necessary during implementation

### 2.3 Pointer accessibility
Default mode:
- keep current layout unless real issues are found

Low-vision mode:
- important interactive controls should reach at least **44×44 px** target size
- this includes icon buttons, modal close buttons, top-bar controls, selection actions, pagination controls, and similar primary interactions

## 3. Understandable

### 3.1 Language
Required:
- root language is English
- aria labels, helper text, and titles should be English
- local `lang` only for genuine foreign-language fragments

### 3.2 Forms
Required:
- explicit labels for form controls
- `aria-invalid` on invalid inputs where applicable
- `aria-describedby` wiring for help/error text where applicable
- understandable validation messages
- no reliance on placeholder text as the only label
- preserve or improve autocomplete attributes for common fields

Special attention:
- auth forms
- gallery creation / rename
- profile settings
- share-link configuration forms
- public-gallery selection start form

### 3.3 Predictability
Required:
- consistent naming for similar actions
- avoid unexpected context changes on focus/input
- predictable dialog behavior
- maintain stable navigation patterns

## 4. Robust

### 4.1 Semantics and ARIA
Required:
- prefer native elements first
- add ARIA only where semantics need help
- avoid fake buttons where native buttons are possible
- tab patterns and disclosure patterns must be internally consistent
- dynamic status updates should use live regions where meaningful

### 4.2 Assistive-technology compatibility
Required manual validation target:
- keyboard-only walkthrough
- screen-reader spot checks for critical flows
- browser zoom to 200%
- mobile and narrow viewport sanity checks

## Mandatory low-vision mode

## UX requirements
The app must expose a user-facing low-vision mode control.

Minimum expected entry points:
- visible toggle in the authenticated app shell
- visible access from public/share flows where practical
- discoverable access from the accessibility page

Preferences must persist in `localStorage`.

## Minimum settings
The low-vision mode must provide at least:

1. **Enable / disable mode**
2. **Font scale**
   - 100%
   - 125%
   - 150%
   - 200%
3. **Contrast theme**
   - black on white
   - white on black
   - dark blue on light blue
   - brown on beige
4. **Line spacing**
   - at least several readable presets
5. **Larger controls / target size behavior**
   - enforced by the mode, not by per-component manual user tuning

## Low-vision mode implementation constraints
- it should work across the entire app, not just one page
- it should be primarily CSS/token driven
- it should not require branching every component into separate versions
- it must preserve core functionality in dialogs, galleries, forms, navigation, and public share flows
- it should remain compatible with dark/light theme behavior or intentionally supersede it in a clearly defined way

## Interaction between regular theme and low-vision mode
Decision:
- low-vision mode is a **higher-priority presentation mode** than ordinary decorative theme preference
- when low-vision mode is enabled, its contrast palette and readability variables take precedence over the standard light/dark visual styling where needed

Implementation may still preserve internal light/dark infrastructure, but readability-mode contrast settings win.

## Reusable dialog system requirements
We should converge modal behavior on a shared accessible pattern.

Each dialog should support:
- `role="dialog"`
- `aria-modal="true"`
- stable title ID via `aria-labelledby`
- description ID via `aria-describedby` where useful
- focus trap
- initial focus target
- escape close
- backdrop click policy per dialog
- restore focus on close
- no background scroll while modal is open where appropriate

Dialogs that should migrate to the shared pattern first:
- `CreateGalleryModal`
- `ConfirmationModal`
- `PhotoUploadConfirmModal`
- `PhotoRenameModal`
- public gallery start-selection modal
- evaluate `ProfileModal` for alignment with the shared primitive rather than leaving it unique

## Route title strategy
Implement a centralized page-title approach.

Minimum title map:
- Landing
- Login
- Register
- Dashboard
- Gallery
- Public Gallery
- Share Links Dashboard
- Share Link Detail
- Error / 404 / 403 / 500 / 503
- Accessibility

Recommended title style:
- `<Page Name> · Viewport`

## Documentation deliverables
Create a dedicated accessibility page in English.

The page should include:
- what accessibility support exists in Viewport
- how to enable low-vision mode
- keyboard shortcuts / keyboard usage notes
- supported readability settings
- target compliance statement: **AA target aligned with ГОСТ Р 52872-2019**
- known limitations, if any remain after implementation

## Tooling and testing deliverables

### Linters
Required:
- enable `eslint-plugin-jsx-a11y` in the frontend ESLint config
- fix or consciously suppress violations only when justified

### Automated testing
Recommended:
- add `axe-core`-based checks for critical pages/components if it meaningfully helps maintain the work
- optionally use Lighthouse as a development verification tool for accessibility regressions

Minimum important coverage areas:
- layout / app shell
- dialogs
- auth forms
- gallery page
- public gallery page
- low-vision mode toggle + persisted settings

### Manual verification
Required before considering the RFC implemented:
- keyboard-only traversal through key flows
- modal open/close/focus restore behavior
- zoom to 200%
- low-vision mode contrast themes sanity check
- low-vision mode target-size sanity check
- screen-reader spot checks on high-value flows

## Suggested implementation order

### Phase 1 — foundation
- enable JSX a11y linting
- introduce route-title helper
- add skip link and landmark cleanup
- add readability-mode store and root-attribute plumbing
- define readability CSS variables / tokens

### Phase 2 — reusable accessibility primitives
- build shared dialog foundation
- migrate existing dialogs/modals
- normalize focus restore and escape handling

### Phase 3 — content and control accessibility
- replace weak photo alt text
- fix icon buttons and action names
- improve form labels/errors/descriptions
- improve dynamic live-region messaging where needed

### Phase 4 — low-vision mode rollout
- add toggle and settings UI
- add contrast themes
- add font scaling and spacing controls
- increase control sizes in mode
- verify galleries, public pages, auth, and dialogs under the mode

### Phase 5 — docs and verification
- add accessibility page
- add automated checks where chosen
- run manual accessibility pass
- document remaining limitations if any

## Acceptance criteria
The RFC is considered implemented only when all of the following are true:

### Site-wide accessibility baseline
- key routes have meaningful page titles
- a skip link exists and works
- landmarks and headings are coherent
- interactive icon-only controls have accessible names
- major dialogs follow a consistent accessible pattern
- keyboard-only users can complete core flows
- obvious placeholder alt text for photos is removed in favor of display names
- forms expose understandable labels and error states

### Low-vision mode
- the mode exists and is user-accessible
- preferences persist across reloads
- at least 4 contrast schemes are implemented
- font scaling presets up to 200% are implemented
- line-spacing/readability controls are implemented
- important controls enlarge to 44×44 in low-vision mode
- the mode works on core app routes and public share flows

### Tooling and docs
- JSX accessibility linting is enabled
- accessibility documentation page exists
- verification evidence is captured through tests and/or documented manual checks

## Risks and implementation notes
- the current frontend has many handcrafted modal implementations, so migration may touch multiple files
- readability mode can create layout regressions if token changes are not systemic
- galleries and public share flows are the highest-risk areas because they mix images, overlays, selection, dialogs, and keyboard interaction
- avoid overusing ARIA where native semantics solve the problem better

## References
- ГОСТ Р 52872-2019 summary and text entry point: https://slabovid.ru/info/requirements/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- MDN accessibility docs: https://developer.mozilla.org/en-US/docs/Web/Accessibility
- axe-core: https://github.com/dequelabs/axe-core
- eslint-plugin-jsx-a11y: https://github.com/jsx-eslint/eslint-plugin-jsx-a11y
