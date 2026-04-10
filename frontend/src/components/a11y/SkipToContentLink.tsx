interface SkipToContentLinkProps {
  targetId?: string;
}

export const SkipToContentLink = ({ targetId = 'main-content' }: SkipToContentLinkProps) => (
  <a
    href={`#${targetId}`}
    className="skip-link fixed left-4 top-4 z-[120] -translate-y-24 rounded-xl border border-border bg-surface px-4 py-3 font-semibold text-text shadow-lg transition-transform focus:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent dark:bg-surface-dark dark:text-accent-foreground"
  >
    Skip to main content
  </a>
);
