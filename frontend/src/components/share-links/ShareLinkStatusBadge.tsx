import type { ShareLinkComputedStatus } from './shareLinkStatus';

interface ShareLinkStatusBadgeProps {
  status: ShareLinkComputedStatus;
}

const STATUS_CLASSES: Record<ShareLinkComputedStatus, string> = {
  active: 'border border-success/30 bg-success/10 text-success',
  inactive: 'border border-danger/30 bg-danger/10 text-danger',
  expired: 'border border-accent/30 bg-accent/10 text-accent',
};

export const ShareLinkStatusBadge = ({ status }: ShareLinkStatusBadgeProps) => (
  <span
    className={`inline-flex rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide ${STATUS_CLASSES[status]}`}
  >
    {status}
  </span>
);
