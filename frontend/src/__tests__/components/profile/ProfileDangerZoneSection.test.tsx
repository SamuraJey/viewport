import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProfileDangerZoneSection } from '../../../components/profile/ProfileDangerZoneSection';

describe('ProfileDangerZoneSection', () => {
  it('keeps logout actionable and clearly marks account deletion as unavailable', async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();

    render(<ProfileDangerZoneSection onLogout={onLogout} />);

    await user.click(screen.getByRole('button', { name: 'Logout' }));

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Delete account')).toBeInTheDocument();
    expect(
      screen.getByText(/account deletion is not available in this build yet/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unavailable/i })).toBeDisabled();
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
  });
});
