# Owner Collection Cards

Project cards on the dashboard and gallery cards inside a project use the same
visual and structural primitives from
`frontend/src/components/dashboard/CollectionCard.tsx`.

## Shared contract

`CollectionCard` owns the outer article, border, radius, surface, elevation,
hover/focus treatment, body spacing, and optional footer. The accompanying
primitives keep both collection levels consistent:

- `CollectionCardCover` provides the fixed-height media area and separate
  overlay zones for status badges, persistent controls, and contextual actions.
- `CollectionCardTitle` provides the shared Oswald, uppercase, responsive title
  treatment.
- `CollectionCardMetrics` renders the divided metric footer from data items
  rather than project- or gallery-specific markup.
- `CollectionShareBadge` provides the common public-share status.

The shared shell remains responsible for presentation. It does not own routing,
menus, mutations, or domain-specific state.

## Domain-specific extensions

Project cards retain project-only behavior: preview rotation, active-viewer and
delivery indicators, quick actions, the project menu, and the dashboard reorder
handle.

Gallery cards retain gallery-only behavior: project visibility, share/delete
actions, inline rename, and the separate reorder service row used on the project
page. The reorder row stays outside the card so drag controls cannot collide
with cover actions.

## Responsive overlay rule

Status badges occupy the top-left cover zone. Contextual actions use the
top-right zone at `sm` and larger sizes. On narrow viewports, contextual actions
move to a second row below the badges so localization, additional status
badges, and focus-visible actions cannot overlap.

## Accessibility and testing

Each card is a labelled `article`. Navigation remains an explicit link, while
mutating actions remain buttons with scoped accessible labels.

Regression coverage lives in:

- `frontend/src/__tests__/components/dashboard/ProjectCard.test.tsx`
- `frontend/src/__tests__/components/dashboard/EnhancedGalleryCard.test.tsx`
- `frontend/src/__tests__/components/project-page/SortableProjectGalleryGrid.test.tsx`

When adding another owner collection card, compose these primitives before
introducing another shell or metric layout.
