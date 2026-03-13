import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useRef, useState } from 'react';

import { CreateGalleryModal } from '../../../components/dashboard/CreateGalleryModal';
import { GALLERY_NAME_MAX_LENGTH } from '../../../constants/gallery';

const defaultProps = {
  isOpen: true,
  isCreating: false,
  shootingDate: '2024-01-01',
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  onShootingDateChange: vi.fn(),
};

const ModalWithState = ({ initialName = '' }: { initialName?: string }) => {
  const [value, setValue] = useState(initialName);
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <CreateGalleryModal
      {...defaultProps}
      newGalleryName={value}
      inputRef={inputRef}
      onNameChange={setValue}
    />
  );
};

describe('CreateGalleryModal', () => {
  it('shows helper text that counts down remaining characters', async () => {
    const user = userEvent.setup();
    render(<ModalWithState />);

    const input = screen.getByLabelText(/Gallery name/i);
    await user.type(input, 'Hello');

    expect(
      screen.getByText(new RegExp(`Up to ${GALLERY_NAME_MAX_LENGTH} characters.`)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`${GALLERY_NAME_MAX_LENGTH - 5} left.`)),
    ).toBeInTheDocument();
  });

  it('disables the confirm button when the name exceeds the limit', () => {
    const longName = 'A'.repeat(GALLERY_NAME_MAX_LENGTH + 5);
    const inputRef = createRef<HTMLInputElement>();

    render(
      <CreateGalleryModal
        {...defaultProps}
        newGalleryName={longName}
        inputRef={inputRef}
        onNameChange={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: /create gallery/i });
    expect(button).toBeDisabled();

    const helper = screen.getByText(new RegExp(`Up to ${GALLERY_NAME_MAX_LENGTH} characters.`));
    expect(helper).toHaveClass('text-danger');
    expect(helper).toHaveTextContent(/-\d+ left\./);
  });
});
