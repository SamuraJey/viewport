import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProfilePasswordSection } from '../../../components/profile/ProfilePasswordSection';

const PasswordHarness = ({ onChangePassword }: { onChangePassword: () => void }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <ProfilePasswordSection
      currentPassword={currentPassword}
      newPassword={newPassword}
      confirmPassword={confirmPassword}
      showCurrentPassword={showCurrentPassword}
      showNewPassword={showNewPassword}
      showConfirmPassword={showConfirmPassword}
      changingPassword={false}
      confirmPassRef={createRef<HTMLInputElement>()}
      setCurrentPassword={setCurrentPassword}
      setNewPassword={setNewPassword}
      setConfirmPassword={setConfirmPassword}
      setShowCurrentPassword={setShowCurrentPassword}
      setShowNewPassword={setShowNewPassword}
      setShowConfirmPassword={setShowConfirmPassword}
      onChangePassword={onChangePassword}
    />
  );
};

describe('ProfilePasswordSection', () => {
  it('uses field-specific visibility labels and toggles password field types', async () => {
    const user = userEvent.setup();

    render(<PasswordHarness onChangePassword={vi.fn()} />);

    const currentPassword = screen.getByLabelText(/^current password$/i);
    expect(currentPassword).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show current password' }));
    expect(currentPassword).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide current password' })).toBeInTheDocument();
  });

  it('blocks mismatched confirmations and submits matching passwords', async () => {
    const user = userEvent.setup();
    const onChangePassword = vi.fn();

    render(<PasswordHarness onChangePassword={onChangePassword} />);

    await user.type(screen.getByLabelText(/^current password$/i), 'old-password');
    await user.type(screen.getByLabelText(/^new password$/i), 'VeryStrongPass1!');

    expect(screen.getByText('Excellent')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^confirm new password$/i), 'different');
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match');
    expect(screen.getByRole('button', { name: /change password/i })).toBeDisabled();

    await user.clear(screen.getByLabelText(/^confirm new password$/i));
    await user.type(screen.getByLabelText(/^confirm new password$/i), 'VeryStrongPass1!');
    await user.click(screen.getByRole('button', { name: /change password/i }));

    expect(screen.getByRole('status')).toHaveTextContent('Passwords match');
    expect(onChangePassword).toHaveBeenCalledTimes(1);
  });
});
