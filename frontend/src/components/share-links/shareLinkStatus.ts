import type { ShareLink } from '../../types';

export type ShareLinkComputedStatus = 'active' | 'inactive' | 'expired';

export const getShareLinkStatus = (
  link: Pick<ShareLink, 'is_active' | 'expires_at'>,
): ShareLinkComputedStatus => {
  if (link.is_active === false) {
    return 'inactive';
  }

  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) {
    return 'expired';
  }

  return 'active';
};
