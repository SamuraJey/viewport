import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProfileInfoSection } from '../../../components/profile/ProfileInfoSection';

const ProfileInfoHarness = ({ onProfileSave }: { onProfileSave: () => void }) => {
  const [displayName, setDisplayName] = useState('Sam');

  return (
    <ProfileInfoSection
      email="sam@example.com"
      displayName={displayName}
      storageUsed={5 * 1024 * 1024}
      storageQuota={10 * 1024 * 1024}
      storagePercent={150}
      showStorageTooltip={false}
      savingProfile={false}
      firstFieldRef={createRef<HTMLInputElement>()}
      setDisplayName={setDisplayName}
      setShowStorageTooltip={vi.fn()}
      onProfileSave={onProfileSave}
    />
  );
};

describe('ProfileInfoSection', () => {
  it('submits valid display names and clamps over-quota storage progress for assistive tech', async () => {
    const user = userEvent.setup();
    const onProfileSave = vi.fn();

    render(<ProfileInfoHarness onProfileSave={onProfileSave} />);

    expect(screen.getByLabelText(/email address/i)).toHaveAttribute('readonly');
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText(/5\.0 MB/)).toBeInTheDocument();

    const progress = screen.getByRole('progressbar', { name: '100% storage used' });
    expect(progress).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('Critical — 100% used')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save profile/i }));

    expect(onProfileSave).toHaveBeenCalledTimes(1);
  });

  it('prevents saving a blank display name', async () => {
    const user = userEvent.setup();
    const onProfileSave = vi.fn();

    render(<ProfileInfoHarness onProfileSave={onProfileSave} />);

    await user.clear(screen.getByLabelText(/display name/i));

    expect(screen.getByRole('button', { name: /save profile/i })).toBeDisabled();
    expect(onProfileSave).not.toHaveBeenCalled();
  });
});
