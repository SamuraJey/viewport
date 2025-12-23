import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { useConfirmation } from '../../hooks/useConfirmation';

describe('useConfirmation', () => {
    it('renders modal and invokes onConfirm', async () => {
        const onConfirm = vi.fn().mockResolvedValue(undefined);

        const TestComponent = () => {
            const { openConfirm, ConfirmModal } = useConfirmation();
            return (
                <div>
                    <button
                        onClick={() =>
                            openConfirm({
                                title: 'Delete',
                                message: 'Are you sure?',
                                confirmText: 'Yes',
                                cancelText: 'No',
                                onConfirm,
                            })
                        }
                    >
                        Open
                    </button>
                    {ConfirmModal}
                </div>
            );
        };

        render(<TestComponent />);

        await userEvent.click(screen.getByText('Open'));

        const confirmButton = await screen.findByRole('button', { name: /yes/i });
        await userEvent.click(confirmButton);

        await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    });
});
