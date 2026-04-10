import { motion } from 'framer-motion';
import { Eye, Palette, Type, X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  type ReadabilityContrast,
  type ReadabilityFontScale,
  type ReadabilityLineSpacing,
  useReadabilityStore,
} from '../stores/readabilityStore';
import { useAccessibleDialog } from '../hooks/useAccessibleDialog';

interface ReadabilitySettingsButtonProps {
  variant?: 'floating' | 'inline';
}

const contrastOptions: { value: ReadabilityContrast; label: string }[] = [
  { value: 'black-on-white', label: 'Black on white' },
  { value: 'white-on-black', label: 'White on black' },
  { value: 'blue-on-light', label: 'Dark blue on light blue' },
  { value: 'brown-on-beige', label: 'Brown on beige' },
];

const fontScaleOptions: ReadabilityFontScale[] = ['100', '125', '150', '200'];
const lineSpacingOptions: { value: ReadabilityLineSpacing; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'comfortable', label: 'Relaxed' },
  { value: 'spacious', label: 'Spacious' },
];

export const ReadabilitySettingsButton = ({
  variant = 'inline',
}: ReadabilitySettingsButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const {
    enabled,
    contrast,
    fontScale,
    lineSpacing,
    reset,
    toggleEnabled,
    setContrast,
    setFontScale,
    setLineSpacing,
  } = useReadabilityStore();

  const { dialogRef, titleId, descriptionId, handleBackdropClick } = useAccessibleDialog({
    isOpen,
    onClose: () => setIsOpen(false),
  });

  const buttonClassName =
    variant === 'floating'
      ? 'fixed right-18 top-4 z-50 inline-flex h-11 min-w-11 items-center justify-center rounded-xl border border-border/50 bg-surface/80 px-3 text-text shadow-lg backdrop-blur-md transition-all hover:shadow-xl hover:-translate-y-0.5 dark:bg-surface-dark/80'
      : 'inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-border/40 bg-surface-1 px-3 text-text shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-border/60 dark:bg-surface-dark-1';

  const dialog =
    isOpen && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[60] overflow-y-auto p-4 sm:p-6">
            <div className="flex min-h-full items-start justify-center sm:items-center">
              <motion.button
                type="button"
                aria-label="Close readability settings"
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleBackdropClick}
              />
              <motion.div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                tabIndex={-1}
                className="relative z-10 my-4 w-full max-w-xl overflow-y-auto rounded-3xl border border-border/50 bg-surface p-6 shadow-2xl max-sm:max-h-[calc(100dvh-2rem)] sm:max-h-[min(48rem,calc(100dvh-3rem))] dark:border-border/30 dark:bg-surface-dark"
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
              >
                <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-4">
                  <div>
                    <h2 id={titleId} className="text-xl font-bold text-text">
                      Low-vision mode
                    </h2>
                    <p id={descriptionId} className="mt-1 text-sm text-muted">
                      Increase readability with stronger contrast, larger text, and larger controls.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/50 bg-surface-1 text-muted transition-colors hover:text-text dark:bg-surface-dark-1"
                    aria-label="Close readability settings"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-5 space-y-6">
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/40 bg-surface-1 p-4 dark:bg-surface-dark-1">
                      <div>
                        <p className="text-sm font-semibold text-text">Enable low-vision mode</p>
                        <p className="text-xs text-muted">
                          Applies system-wide readability settings and larger controls.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={toggleEnabled}
                        className={`inline-flex min-w-24 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                          enabled
                            ? 'bg-accent text-accent-foreground'
                            : 'border border-border/50 bg-surface text-text'
                        }`}
                      >
                        {enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Palette className="h-4 w-4 text-accent" />
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                        Contrast theme
                      </h3>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {contrastOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setContrast(option.value)}
                          className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                            contrast === option.value
                              ? 'border-accent bg-accent/10 text-accent'
                              : 'border-border/50 bg-surface-1 text-text dark:bg-surface-dark-1'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Type className="h-4 w-4 text-accent" />
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                        Font scale
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {fontScaleOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setFontScale(option)}
                          className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                            fontScale === option
                              ? 'bg-accent text-accent-foreground'
                              : 'border border-border/50 bg-surface-1 text-text dark:bg-surface-dark-1'
                          }`}
                        >
                          {option}%
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                      Line spacing
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {lineSpacingOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setLineSpacing(option.value)}
                          className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                            lineSpacing === option.value
                              ? 'bg-accent text-accent-foreground'
                              : 'border border-border/50 bg-surface-1 text-text dark:bg-surface-dark-1'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </section>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
                  <Link
                    to="/accessibility"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm font-semibold text-text transition-all duration-200 hover:border-accent/40 hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:bg-surface-dark-1"
                  >
                    Accessibility page
                  </Link>
                  <button
                    type="button"
                    onClick={reset}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/50 bg-surface px-3 py-2 text-sm font-semibold text-text transition-all duration-200 hover:border-accent/40 hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:bg-surface-dark-1"
                  >
                    Reset
                  </button>
                </div>
              </motion.div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={buttonClassName}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={enabled ? 'Open readability settings' : 'Open low-vision settings'}
      >
        <Eye className="h-4 w-4" />
        {variant === 'inline' ? (
          <span className="ml-2 hidden text-xs font-semibold sm:inline">
            {enabled ? 'Low vision on' : 'Low vision'}
          </span>
        ) : null}
      </button>

      {dialog}
    </>
  );
};
