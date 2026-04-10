import { Link } from 'react-router-dom';
import { Accessibility, ArrowLeft, Eye, Keyboard, Palette, Type } from 'lucide-react';
import { ReadabilitySettingsButton } from '../components/ReadabilitySettingsButton';
import { SkipToContentLink } from '../components/a11y/SkipToContentLink';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { MAIN_CONTENT_ID } from '../lib/accessibility';

const shortcuts = [
  { keys: '/', description: 'Focus the gallery search field when available.' },
  { keys: 'Shift + F', description: 'Open public sort settings on the gallery page.' },
  {
    keys: 'Escape',
    description: 'Close dialogs, clear search, or exit selection mode where supported.',
  },
  { keys: 'Ctrl/Cmd + A', description: 'Select all photos when selection mode is active.' },
  {
    keys: 'Tab / Shift + Tab',
    description: 'Move forward or backward through interactive controls.',
  },
];

const supportAreas = [
  'Keyboard-friendly navigation and visible focus states across core routes.',
  'Improved labels, dialog semantics, live status messaging, and form guidance.',
  'Route titles, skip navigation, and landmark-based page structure.',
  'Dedicated low-vision mode with stronger contrast, larger text, and roomier spacing.',
];

export const AccessibilityPage = () => {
  useDocumentTitle('Accessibility · Viewport');

  return (
    <div className="min-h-screen bg-surface text-text dark:bg-surface-dark">
      <SkipToContentLink targetId={MAIN_CONTENT_ID} />
      <div className="fixed right-4 top-4 z-40 flex items-center gap-2">
        <ReadabilitySettingsButton />
      </div>
      <main
        id={MAIN_CONTENT_ID}
        className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-12 sm:px-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-2 text-sm font-semibold transition-all duration-200 hover:border-accent/40 hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:bg-surface-dark-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-accent">
            <Accessibility className="h-4 w-4" />
            Accessibility
          </span>
        </div>

        <section className="rounded-3xl border border-border/50 bg-surface-1/70 p-6 shadow-sm dark:bg-surface-dark-1/60 sm:p-8">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Accessibility in Viewport
          </h1>
          <p className="mt-4 max-w-3xl text-base text-muted sm:text-lg">
            Viewport is being aligned with an <strong>AA target</strong> based on{' '}
            <strong>ГОСТ Р 52872-2019</strong> and WCAG guidance. We aim to keep the product usable
            with keyboards, screen readers, browser zoom, and dedicated readability settings.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {supportAreas.map((item) => (
            <article
              key={item}
              className="rounded-2xl border border-border/50 bg-surface p-5 shadow-sm dark:bg-surface-dark-1"
            >
              <p className="text-sm font-semibold text-text">{item}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-3xl border border-border/50 bg-surface p-6 shadow-sm dark:bg-surface-dark-1 sm:p-7">
            <div className="flex items-center gap-3">
              <Eye className="h-5 w-5 text-accent" />
              <h2 className="text-2xl font-bold">Low-vision mode</h2>
            </div>
            <p className="mt-3 text-muted">
              Use the floating readability control to enable low-vision mode and adjust the
              interface.
            </p>
            <ul className="mt-4 space-y-3 text-sm text-text">
              <li>• Font scale presets: 100%, 125%, 150%, 200%</li>
              <li>• Contrast themes: black/white, white/black, blue/cyan, brown/beige</li>
              <li>• Spacing presets for more comfortable line-height</li>
              <li>• Larger key controls and stronger focus styling while the mode is active</li>
            </ul>
          </article>

          <article className="rounded-3xl border border-border/50 bg-surface p-6 shadow-sm dark:bg-surface-dark-1 sm:p-7">
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 text-accent" />
              <h2 className="text-2xl font-bold">Known scope</h2>
            </div>
            <p className="mt-3 text-muted">
              Accessibility improvements are ongoing. If a specific workflow still feels difficult,
              use the low-vision mode first and verify the latest app version.
            </p>
            <p className="mt-4 text-sm text-muted">
              Current target: AA-level support aligned with ГОСТ Р 52872-2019.
            </p>
          </article>
        </section>

        <section className="rounded-3xl border border-border/50 bg-surface p-6 shadow-sm dark:bg-surface-dark-1 sm:p-7">
          <div className="flex items-center gap-3">
            <Keyboard className="h-5 w-5 text-accent" />
            <h2 className="text-2xl font-bold">Keyboard shortcuts</h2>
          </div>
          <div className="mt-5 space-y-3">
            {shortcuts.map((item) => (
              <div
                key={item.keys}
                className="flex flex-col gap-2 rounded-2xl border border-border/50 bg-surface-1/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:bg-surface-dark-2/60"
              >
                <span className="inline-flex min-h-11 items-center rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 font-mono text-sm font-bold text-accent">
                  {item.keys}
                </span>
                <span className="text-sm text-text">{item.description}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-border/50 bg-surface p-6 shadow-sm dark:bg-surface-dark-1 sm:p-7">
          <div className="flex items-center gap-3">
            <Type className="h-5 w-5 text-accent" />
            <h2 className="text-2xl font-bold">Assistive technology notes</h2>
          </div>
          <p className="mt-3 text-muted">
            Core user journeys are intended to remain operable with keyboard navigation, browser
            zoom, and screen-reader spot checks on major routes and dialogs.
          </p>
        </section>
      </main>
    </div>
  );
};
