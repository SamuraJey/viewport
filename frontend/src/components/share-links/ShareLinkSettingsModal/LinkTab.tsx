import type { RefObject } from 'react';

interface LinkTabProps {
  label: string;
  setLabel: (value: string) => void;
  normalizedLabel: string;
  isSaving: boolean;
  labelInputRef: RefObject<HTMLInputElement | null>;
}

export const LinkTab = ({
  label,
  setLabel,
  normalizedLabel,
  isSaving,
  labelInputRef,
}: LinkTabProps) => (
  <section className="space-y-4">
    <div>
      <h3 className="text-sm font-semibold text-text">Link identity</h3>
      <p className="text-xs text-muted">Used internally to recognize this share link.</p>
    </div>
    <input
      ref={labelInputRef}
      id="share-link-label"
      type="text"
      aria-label="Share link internal label"
      value={label}
      onChange={(event) => setLabel(event.target.value)}
      maxLength={127}
      placeholder="Client proofing"
      className="w-full rounded-xl border border-border/50 bg-surface-1 px-3 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-accent dark:bg-surface-dark-1"
      disabled={isSaving}
    />
    <div className="rounded-2xl border border-border/50 bg-surface-1 px-4 py-4 dark:bg-surface-dark-1">
      <p className="text-xs font-semibold uppercase text-muted">Current label</p>
      <p className="mt-1 text-sm font-semibold text-text">
        {normalizedLabel || 'Untitled share link'}
      </p>
    </div>
  </section>
);
