# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Viewport optimizes first for solo photographers delivering finished work to clients. Small photography studios are a secondary audience, especially when they need to organize and deliver multiple shoots.

Clients and guests are the main public-facing audience. They open shared galleries or projects without an owner account to view work, select favorites, and download delivered files.

## Product Purpose

Viewport helps photographers turn a finished shoot into a polished client delivery. Owners organize work into projects and galleries, upload photos and videos, shape the public presentation, share controlled links, collect client selections, enable downloads, and monitor delivery activity.

Success means a solo photographer can move from final edit to a presentation-ready client link quickly, while the client can understand and act on the delivery without extra instructions, spreadsheets, screenshots, or repeated message threads.

## Positioning

Viewport leads with the quality of the client presentation: the delivery experience should make the photographer's work and studio feel considered and professional.

Its important secondary advantage is an integrated delivery and proofing workflow. Project organization, gallery presentation, secure sharing, selections, downloads, and analytics live in one calm owner workspace instead of being split across unrelated tools.

## Operating Context

A typical owner workflow is:

1. Create a project for a shoot and add one or more galleries.
2. Upload final images or videos; Viewport creates delivery derivatives while preserving originals.
3. Configure covers, public descriptions, ordering, spacing, color scheme, and selection behavior.
4. Create a gallery-scoped or project-scoped share link, optionally protecting it with a password or expiration date.
5. Send the link to clients, who browse on the web, select favorites, and download permitted files.
6. Review views, downloads, and selection progress, then export selections with gallery context when needed.

Projects are the photographer-facing top-level delivery object. Galleries are the upload and photo-management units inside a project. A gallery can be listed in a project share or kept `direct_only` for access through its own link.

## Capabilities and Constraints

- Project-first organization with explicit gallery creation, ordering, visibility, and project- or gallery-scoped sharing.
- Photo and video uploads to S3-compatible storage, with generated thumbnails, posters, and playback derivatives.
- Public galleries and project shares with responsive photo layouts, cover presentation, gallery navigation, lightbox viewing, and browser-managed downloads.
- Share-link lifecycle controls including labels, activation state, expiration, password protection, and non-disclosing inactive-link behavior.
- Share-link-scoped client selections and favorites, including one selection flow across the listed galleries in a shared project.
- Owner analytics for views, downloads, and selection progress, stored as privacy-conscious daily aggregates rather than raw per-open event logs.
- Storage quotas track original uploads; generated derivatives do not count toward the quota.
- Light, dark, and system theme preferences are supported. Photographer-selected public gallery appearance overrides the viewer's theme for that shared surface.
- The application is a responsive web product. Mobile web remains part of the web experience rather than a separate native platform.
- Current plan names, pricing language, public metrics, testimonials, customer counts, deployment promises, and custom-service claims are not verified product truth and must not be presented as evidence without confirmation.

## Brand Commitments

The product name is **Viewport**.

No logo system, customer-logo set, formal voice guide, or other binding brand asset has been confirmed. Existing interface copy may guide implementation, but it is not proof of external claims.

## Evidence on Hand

- A working full-stack implementation covers owner projects and galleries, media upload and processing, controlled public sharing, client selections, downloads, and analytics.
- An in-memory demo environment exercises owner, gallery, profile, and public flows without backend authentication.
- Repository documentation records project-first organization, scoped sharing, media processing, storage quotas, accessibility work, and frontend interaction patterns.
- The repository contains no verified customer testimonials, customer logos, case studies, revenue or conversion evidence, externally validated performance metrics, or approved pricing.
- The current landing-page figures and testimonial-style content are marketing placeholders unless separately substantiated.
- No product-specific photography library or approved brand imagery is present in the frontend assets.

## Product Principles

1. **Make the photographer look professional.** Client-facing presentation quality is the primary product distinction.
2. **Respect the solo operator's time.** Core delivery work should stay direct, calm, and understandable without administrative overhead.
3. **Keep delivery coherent end to end.** Organization, presentation, access, selections, downloads, and follow-up should behave as one workflow.
4. **Give owners precise control without burdening clients.** Privacy and lifecycle controls belong in the owner workspace; public links should remain focused and easy to use.
5. **Treat accessibility as core product quality.** Keyboard, screen-reader, zoom, contrast, and readability needs apply across owner and public journeys.

## Accessibility & Inclusion

Viewport targets AA-level accessibility aligned with ГОСТ Р 52872-2019 and WCAG guidance. This is a target, not a claim of certification.

Core journeys are intended to support keyboard navigation, visible focus, semantic landmarks and dialogs, live status messaging, browser zoom, screen-reader spot checks, reduced motion, and a dedicated low-vision mode with font-scale, contrast, spacing, and larger-control options.
