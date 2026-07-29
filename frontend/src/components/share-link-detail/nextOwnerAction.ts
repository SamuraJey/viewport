export type NextOwnerActionType =
  | 'edit-expiration'
  | 'edit-link'
  | 'review-selections'
  | 'review-exports'
  | 'open-analytics'
  | 'copy-client-link';

export interface NextOwnerAction {
  hint: string;
  label: string;
  action: NextOwnerActionType;
}

export interface NextOwnerActionInput {
  status: 'active' | 'inactive' | 'expired';
  inProgressSessions: number;
  submittedSessions: number;
  totalViews: number;
}

const ACTIONS = {
  editExpiration: {
    hint: 'Extend the expiration date before sending this link again.',
    label: 'Edit expiration',
    action: 'edit-expiration',
  },
  editLink: {
    hint: 'Review the link settings before sharing it with clients.',
    label: 'Edit link',
    action: 'edit-link',
  },
  reviewSelections: {
    hint: 'Review live selection sessions and close them when the client confirms.',
    label: 'Review selections',
    action: 'review-selections',
  },
  reviewExports: {
    hint: 'Export submitted favorites for delivery or Lightroom.',
    label: 'Review exports',
    action: 'review-exports',
  },
  openAnalytics: {
    hint: 'Review recent client activity and download engagement.',
    label: 'Open analytics',
    action: 'open-analytics',
  },
  copyClientLink: {
    hint: 'Copy the public URL and send it to your client.',
    label: 'Copy client link',
    action: 'copy-client-link',
  },
} as const satisfies Record<string, NextOwnerAction>;

export const getNextOwnerAction = ({
  status,
  inProgressSessions,
  submittedSessions,
  totalViews,
}: NextOwnerActionInput): NextOwnerAction => {
  if (status === 'expired') {
    return ACTIONS.editExpiration;
  }

  if (status === 'inactive') {
    return ACTIONS.editLink;
  }

  if (inProgressSessions > 0) {
    return ACTIONS.reviewSelections;
  }

  if (submittedSessions > 0) {
    return ACTIONS.reviewExports;
  }

  if (totalViews > 0) {
    return ACTIONS.openAnalytics;
  }

  return ACTIONS.copyClientLink;
};
