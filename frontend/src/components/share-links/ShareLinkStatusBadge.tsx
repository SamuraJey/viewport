import { AppBadge } from '../ui';
import type { ShareLinkComputedStatus } from './shareLinkStatus';

interface ShareLinkStatusBadgeProps {
  status: ShareLinkComputedStatus;
}

const STATUS_TONE: Record<ShareLinkComputedStatus, 'success' | 'danger' | 'accent'> = {
  active: 'success',
  inactive: 'danger',
  expired: 'accent',
};

export const ShareLinkStatusBadge = ({ status }: ShareLinkStatusBadgeProps) => (
  <AppBadge tone={STATUS_TONE[status]} variant="subtle" size="xs">
    {status}
  </AppBadge>
);
