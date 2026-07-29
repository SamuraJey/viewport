import { describe, expect, it } from 'vitest';
import {
  getNextOwnerAction,
  type NextOwnerActionInput,
} from '../../../components/share-link-detail/nextOwnerAction';

const activeLinkWithoutActivity: NextOwnerActionInput = {
  status: 'active',
  inProgressSessions: 0,
  submittedSessions: 0,
  totalViews: 0,
};

describe('getNextOwnerAction', () => {
  it.each([
    {
      name: 'edits expiration for an expired link',
      input: {
        status: 'expired',
        inProgressSessions: 4,
        submittedSessions: 3,
        totalViews: 20,
      },
      expected: {
        hint: 'Extend the expiration date before sending this link again.',
        label: 'Edit expiration',
        action: 'edit-expiration',
      },
    },
    {
      name: 'edits an inactive link before reviewing its activity',
      input: {
        status: 'inactive',
        inProgressSessions: 4,
        submittedSessions: 3,
        totalViews: 20,
      },
      expected: {
        hint: 'Review the link settings before sharing it with clients.',
        label: 'Edit link',
        action: 'edit-link',
      },
    },
    {
      name: 'reviews in-progress selections before submitted exports or analytics',
      input: {
        ...activeLinkWithoutActivity,
        inProgressSessions: 4,
        submittedSessions: 3,
        totalViews: 20,
      },
      expected: {
        hint: 'Review live selection sessions and close them when the client confirms.',
        label: 'Review selections',
        action: 'review-selections',
      },
    },
    {
      name: 'reviews submitted exports before analytics',
      input: {
        ...activeLinkWithoutActivity,
        submittedSessions: 3,
        totalViews: 20,
      },
      expected: {
        hint: 'Export submitted favorites for delivery or Lightroom.',
        label: 'Review exports',
        action: 'review-exports',
      },
    },
    {
      name: 'opens analytics when the link only has views',
      input: {
        ...activeLinkWithoutActivity,
        totalViews: 20,
      },
      expected: {
        hint: 'Review recent client activity and download engagement.',
        label: 'Open analytics',
        action: 'open-analytics',
      },
    },
    {
      name: 'copies the client link when there is no activity',
      input: activeLinkWithoutActivity,
      expected: {
        hint: 'Copy the public URL and send it to your client.',
        label: 'Copy client link',
        action: 'copy-client-link',
      },
    },
  ] satisfies Array<{
    name: string;
    input: NextOwnerActionInput;
    expected: ReturnType<typeof getNextOwnerAction>;
  }>)('$name', ({ input, expected }) => {
    expect(getNextOwnerAction(input)).toEqual(expected);
  });
});
