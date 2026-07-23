---
name: Viewport
description: Calm, presentation-first gallery delivery for photographers.
colors:
  viewfinder-blue: "rgb(31 144 255)"
  viewfinder-blue-dark: "rgb(48 120 175)"
  gallery-sky: "rgb(56 189 248)"
  cool-canvas: "rgb(255 255 255)"
  cool-canvas-soft: "rgb(248 250 252)"
  cool-canvas-muted: "rgb(241 245 249)"
  slate-ink: "rgb(15 23 36)"
  slate-muted: "rgb(100 116 139)"
  slate-border: "rgb(203 213 225)"
  darkroom: "rgb(24 24 27)"
  darkroom-raised: "rgb(39 39 42)"
  darkroom-high: "rgb(63 63 70)"
  darkroom-ink: "rgb(243 244 246)"
  darkroom-muted: "rgb(186 195 210)"
  darkroom-border: "rgb(113 113 122)"
  success: "rgb(16 185 129)"
  warning: "rgb(245 158 11)"
  info: "rgb(56 189 248)"
  danger: "rgb(239 68 68)"
typography:
  display:
    fontFamily: "Oswald, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 700
    lineHeight: 0.92
    letterSpacing: "0.05em"
  headline:
    fontFamily: "Oswald, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.025em"
  title:
    fontFamily: "Oswald, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.025em"
  body:
    fontFamily: "Oswald, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Oswald, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.16em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  control: "0.75rem"
  action: "1rem"
  panel: "1.5rem"
  drawer: "1.75rem"
  pill: "9999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "8": "2rem"
  "18": "4.5rem"
  "88": "22rem"
components:
  button-primary:
    backgroundColor: "{colors.viewfinder-blue}"
    textColor: "{colors.cool-canvas}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
  button-primary-dark:
    backgroundColor: "{colors.viewfinder-blue-dark}"
    textColor: "{colors.cool-canvas}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
  button-secondary:
    backgroundColor: "{colors.cool-canvas-soft}"
    textColor: "{colors.slate-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
  input:
    backgroundColor: "{colors.cool-canvas}"
    textColor: "{colors.slate-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.action}"
    padding: "0.75rem 1rem"
    height: "3rem"
  card:
    backgroundColor: "{colors.cool-canvas-soft}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.panel}"
    padding: "1.5rem"
  badge-subtle:
    backgroundColor: "{colors.cool-canvas-muted}"
    textColor: "{colors.slate-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.625rem"
  nav-active:
    backgroundColor: "{colors.viewfinder-blue}"
    textColor: "{colors.cool-canvas}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.75rem"
---

# Design System: Viewport

## Overview

**Creative North Star: "The Modern Proofing Room"**

Viewport behaves like a contemporary proofing room: photography receives the visual priority, while every surrounding control feels deliberate, quiet, and ready for professional work. The system is calm and confident rather than decorative. Strong uppercase headings establish orientation, compact operational controls stay close to the work, and public gallery surfaces recede so the delivered images lead.

The identity combines cool blue signals, slate and zinc neutrals, oversized rounded geometry, fine borders, and ambient depth. It uses polish to make client delivery feel considered without turning the owner workspace into corporate SaaS noise. Density changes with purpose: owner surfaces are compact and scannable; public gallery surfaces are spacious and image-led.

**Key Characteristics:**

- Oswald-led, uppercase display hierarchy with narrow, forceful silhouettes.
- Viewfinder Blue used as a functional signal for action, focus, selection, and status.
- Cool Canvas light surfaces and Darkroom zinc surfaces with semantic theme parity.
- Soft precision: generous radii, thin borders, exact alignment, and compact controls.
- Ambient layering through tonal surfaces, translucency, blur, and diffuse shadows.
- Responsive mode changes, including desktop top navigation, mobile bottom navigation, and adaptive drawers.
- Motion that confirms state and hierarchy while respecting reduced-motion preferences.

## Colors

The palette pairs a clear photographic blue with cool canvas neutrals in light mode and zinc-toned darkroom surfaces in dark mode.

### Primary

- **Viewfinder Blue** (`rgb(31 144 255)`): Primary light-theme action, focus, selection, and active-state signal.
- **Dark Viewfinder Blue** (`rgb(48 120 175)`): Muted dark-theme action color that avoids harsh contrast against Darkroom surfaces.

### Secondary

- **Gallery Sky** (`rgb(56 189 248)`): Scoped public-gallery accent and informational highlight; it keeps photographer-selected gallery themes distinct from the owner shell.

### Neutral

- **Cool Canvas** (`rgb(255 255 255)`): Base light surface and high-contrast content field.
- **Soft Cool Canvas** (`rgb(248 250 252)`): First raised light surface, card field, and subtle control background.
- **Muted Cool Canvas** (`rgb(241 245 249)`): Secondary light surface and nested control layer.
- **Slate Ink** (`rgb(15 23 36)`): Primary light-theme text.
- **Slate Muted** (`rgb(100 116 139)`): Supporting copy, metadata, and inactive controls.
- **Slate Border** (`rgb(203 213 225)`): Light-theme dividers and low-emphasis component outlines.
- **Darkroom** (`rgb(24 24 27)`): Base dark surface.
- **Raised Darkroom** (`rgb(39 39 42)`): Cards, popovers, and nested dark surfaces.
- **High Darkroom** (`rgb(63 63 70)`): Hovered controls, tertiary surfaces, and higher tonal separation.
- **Darkroom Ink** (`rgb(243 244 246)`): Primary dark-theme text.
- **Darkroom Muted** (`rgb(186 195 210)`): Supporting dark-theme copy.
- **Darkroom Border** (`rgb(113 113 122)`): Dark-theme structure and outlines.

### Semantic

- **Success Green** (`rgb(16 185 129)`): Successful uploads, active links, confirmed states, and positive badges.
- **Warning Amber** (`rgb(245 158 11)`): Time-sensitive or cautionary states.
- **Information Sky** (`rgb(56 189 248)`): Neutral information and progress.
- **Danger Red** (`rgb(239 68 68)`): Destructive actions, failures, and irreversible warnings.

### Named Rules

**The Viewfinder Signal Rule.** Blue marks actions, focus, selected states, and meaningful information. Do not wash entire owner screens in blue or let it compete with photography.

**The Photographer's Scheme Rule.** A public gallery's scoped light or dark appearance overrides the viewer's shell theme. The photographer controls the presentation of delivered work.

**The Semantic State Rule.** Green, amber, sky, and red communicate state; they are not decorative substitutes for the primary accent.

## Typography

**Display Font:** Oswald (with `sans-serif` fallback)  
**Body Font:** Oswald (with `sans-serif` fallback)  
**Label/Mono Font:** The platform monospace stack for shortcuts, tokens, identifiers, and tabular details

**Character:** The implemented system uses one condensed voice across display and body copy. Weight, size, case, and tracking—not a second family—create hierarchy. The result feels direct and studio-like, with monospaced details reserved for operational data.

### Hierarchy

- **Display** (700, 3rem mobile to 4.5rem desktop, 0.92 line-height): Landing-page hero statements and the strongest marketing moments.
- **Public Gallery Display** (700, container-responsive `clamp()` scales up to 7rem, 1.02 line-height): Project or gallery titles placed over full-viewport cover media.
- **Headline** (700, 2.25rem to 3rem, 1 line-height): Major page and section orientation, normally uppercase with wide tracking.
- **Title** (700, 1.25rem to 1.5rem, 1.2 line-height): Drawers, cards, dialogs, and localized groups.
- **Body** (400–500, 0.875rem to 1.125rem, 1.5–1.75 line-height): Explanations, metadata, and instructions; keep longer reading widths near 65–75 characters.
- **Label** (700, 0.625rem to 0.75rem, 0.14–0.22em tracking): Eyebrows, field labels, badges, and compact navigation. Uppercase is expected.
- **Mono** (500, 0.625rem to 0.75rem): Keyboard shortcuts, machine identifiers, tokens, and compact numeric readouts.

### Named Rules

**The Uppercase Hierarchy Rule.** Use uppercase for the brand, display headings, eyebrows, and compact labels. Keep explanatory sentences and client instructions in normal case.

**The One Condensed Voice Rule.** Oswald is the incumbent default for both display and body. Do not introduce a new body family casually; a typography change is a system-level decision.

## Layout

Viewport follows a 4px spacing base with common gaps and padding at 12px, 16px, 20px, 24px, and 32px. Owner pages center inside a 1280px shell, then expand to approximately 1520px and 1920px on extra-wide photo-management screens. Toolbars favor horizontal alignment on large screens and wrap or stack below 1024px.

The responsive breakpoints are 640px (`sm`), 768px (`md`), 1024px (`lg`), 1280px (`xl`), and 1536px (`2xl`). At widths below 768px, primary owner navigation moves from the desktop header into a fixed two-item bottom dock. Editor surfaces become bottom sheets on mobile and right-side drawers from 768px upward. Dialog content remains centered and width-capped.

Public gallery layout is intentionally different from the owner shell. Cover heroes use the full dynamic viewport height, balanced container-responsive typography, and bottom-aligned presentation copy. Photo grids move from one or two columns on small screens to three or four columns at 1024px, with photographer-selected small, medium, or large spacing. Uniform layouts preserve the complete image with `object-fit: contain`; masonry and justified layouts preserve photographic rhythm.

Keep page-level composition selective. A section earns a bordered container when it groups a task, owns a state, or establishes elevation. Do not turn every piece of copy into another dashboard card.

## Elevation & Depth

Viewport uses ambient layering. Fine borders and tonal surface steps establish most structure; diffuse shadows, translucent surfaces, and backdrop blur distinguish cards, sticky controls, popovers, drawers, and hover states. Light theme shadows use cool near-black ink, while dark theme shadows use faint white halos so elevation remains visible without black voids.

### Shadow Vocabulary

- **Light Ambient XS** (`0 0 0 1px rgb(2 6 23 / 0.05), 0 8px 18px rgb(2 6 23 / 0.08)`): Resting compact panels and low cards.
- **Light Ambient SM** (`0 0 0 1px rgb(2 6 23 / 0.06), 0 10px 24px rgb(2 6 23 / 0.10)`): Standard cards and sticky controls.
- **Light Ambient MD** (`0 0 0 1px rgb(2 6 23 / 0.07), 0 14px 30px rgb(2 6 23 / 0.14)`): Hovered controls and raised interactive cards.
- **Light Ambient XL** (`0 0 0 1px rgb(2 6 23 / 0.10), 0 24px 48px rgb(2 6 23 / 0.22)`): Dialogs, drawers, and dominant overlays.
- **Dark Ambient XS** (`0 0 0 1px rgb(255 255 255 / 0.08), 0 8px 18px rgb(255 255 255 / 0.06)`): Resting dark cards.
- **Dark Ambient MD** (`0 0 0 1px rgb(255 255 255 / 0.12), 0 14px 30px rgb(255 255 255 / 0.10), 0 0 22px rgb(255 255 255 / 0.06)`): Raised dark controls and cards.
- **Dark Ambient XL** (`0 0 0 1px rgb(255 255 255 / 0.16), 0 24px 48px rgb(255 255 255 / 0.14), 0 0 30px rgb(255 255 255 / 0.10)`): Dark dialogs and drawers.

### Named Rules

**The Ambient Layering Rule.** Surfaces are structured by tone and border first. Add a shadow when a component is sticky, floating, modal, or responding to interaction.

**The Theme-Parity Rule.** Every elevated light surface needs an intentional dark-theme counterpart; do not rely on the browser's default black shadow in dark mode.

## Shapes

The form language is soft but controlled. Compact controls and navigation use 12px corners; prominent actions and inputs use 16px; cards and section containers use 24px; drawers and sheets use 28px on their exposed corners. Status badges, avatars, switches, and small indicators use full pills or circles.

Borders are normally one pixel with 30–60% semantic-border opacity. Rounded surfaces frequently clip cover media and overlays, so imagery, hover states, and badges share one silhouette. Squared containers are reserved for full-bleed media, page edges, and internal tab dividers.

## Components

### Buttons

- **Shape:** Compact actions use 12px corners; large marketing actions use 16px.
- **Primary:** Viewfinder Blue with white text, 10–16px vertical and 16–24px horizontal padding, and 600–700 weight.
- **Hover / Focus:** Hover lifts by 2px or increases brightness and ambient shadow. Focus uses a 3px Viewfinder Blue ring with a 3px surface-colored offset; low-vision mode increases both to 4px.
- **Secondary:** Cool Canvas or Darkroom raised surface, semantic border, and primary text. Hover shifts one tonal level and may tint the border blue.
- **Disabled:** Preserve geometry, remove lift, use 50–60% opacity, and show a not-allowed cursor when actionable state is unavailable.

### Chips

- **Style:** Full-pill silhouette, 10–12px type, 600–700 weight, and compact 4–10px padding.
- **State:** Filled badges may use translucent semantic color and backdrop blur over images; subtle badges use a 30% semantic border with a 10% tonal fill.

### Cards / Containers

- **Corner Style:** 24px for primary cards and 16px for nested task sections.
- **Background:** Cool Canvas or Soft Cool Canvas in light mode; Darkroom or Raised Darkroom in dark mode.
- **Shadow Strategy:** Ambient at rest, stronger on hover for interactive cards.
- **Border:** One-pixel semantic border, usually at 35–50% opacity.
- **Internal Padding:** 16px for compact nested groups, 20–24px for standard cards, and 28–36px for auth or high-attention panels.

### Inputs / Fields

- **Style:** 44–48px height, 12–16px corners, semantic border, solid or transparent semantic surface, and 14px text.
- **Focus:** Border shifts to Viewfinder Blue while the global focus-visible ring supplies keyboard emphasis.
- **Error / Disabled:** Danger text and a lightly tinted danger container for errors; disabled fields reduce opacity without changing layout.
- **Labels:** 10–12px uppercase, bold, and widely tracked; guidance sits separately in muted normal-case text.

### Navigation

Desktop navigation uses compact uppercase 12px controls with 12px corners, fine borders, and tonal active states. The brand uses Oswald uppercase with a blue-tinted camera mark. Below 768px, primary navigation becomes a floating two-column bottom dock with a 24px shell and 16px items; the active destination becomes a filled Viewfinder Blue tile.

### Dialogs and Drawers

Dialogs center over a 50% black backdrop with blur and enter through a small fade, scale, and vertical shift. Drawers preserve page context: right-side panels on desktop and bottom sheets on mobile, with 28px exposed corners, a translucent sticky header, and separate body and footer regions.

### Public Gallery Hero

The signature presentation component fills the dynamic viewport with cover photography or video. A black vertical gradient protects white type without flattening the image. Centered, text-block, and minimalist compositions share container-responsive title sizing, balanced wrapping, bottom alignment, and reduced-motion/save-data behavior.

### Photo Cards

Public photo cards use 12px corners, image-first content, and spacing chosen by the photographer. Hover deepens ambient shadow without adding unrelated chrome. Uniform mode must keep the entire frame visible; controls appear only when they serve viewing, selection, or download.

## Do's and Don'ts

### Do:

- **Do** let photography dominate public surfaces and cover moments.
- **Do** use Viewfinder Blue as a precise signal for action, focus, selection, and active state.
- **Do** preserve semantic theme parity across Cool Canvas and Darkroom surfaces.
- **Do** use 12px, 16px, 24px, and 28px radii according to component scale.
- **Do** keep owner controls compact, scannable, and close to the content they affect.
- **Do** use Headless UI, Vaul, and the shared `App*` wrappers for stateful interaction patterns.
- **Do** respect reduced motion, keyboard focus, browser zoom, and low-vision settings.

### Don't:

- **Don't** create corporate SaaS noise with widget walls, excessive cards, or several competing accents.
- **Don't** use blue as a decorative page wash or replace semantic status colors with it.
- **Don't** introduce a new type family, palette hue, or radius language in an isolated component.
- **Don't** use dark shadows unchanged in dark mode; preserve the light-halo elevation strategy.
- **Don't** crop uniform public-gallery images; preserve the complete photograph with containment.
- **Don't** recreate focus traps, tab ARIA, dialog behavior, or drawer mechanics outside the shared primitives.
- **Don't** let motion obscure content or ignore `prefers-reduced-motion`.
