import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { AppListbox } from '../../../components/ui';

const OPTIONS = [
  { value: 'created_at', label: 'Date created' },
  { value: 'name', label: 'Name' },
] as const;

const AppListboxHarness = ({
  onChange = vi.fn(),
}: {
  onChange?: (value: (typeof OPTIONS)[number]['value']) => void;
}) => {
  const [value, setValue] = useState<(typeof OPTIONS)[number]['value']>('created_at');

  return (
    <AppListbox
      value={value}
      onChange={(nextValue) => {
        setValue(nextValue);
        onChange(nextValue);
      }}
      options={[...OPTIONS]}
      aria-label="Sort galleries by"
      buttonClassName="border border-border bg-surface px-3 py-2"
    />
  );
};

describe('AppListbox', () => {
  it('opens options and selects a new value', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<AppListboxHarness onChange={handleChange} />);

    await user.click(screen.getByLabelText(/sort galleries by/i));

    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByRole('option', { name: 'Name' }));

    await waitFor(() => {
      expect(handleChange).toHaveBeenCalledWith('name');
    });
    expect(screen.getByLabelText(/sort galleries by/i)).toHaveTextContent('Name');
  });

  it('closes when clicking outside', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <AppListboxHarness />
        <button type="button">Outside</button>
      </div>,
    );

    await user.click(screen.getByLabelText(/sort galleries by/i));
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /outside/i }));

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  it('sizes the options panel to fit content without shrinking below the trigger', async () => {
    const user = userEvent.setup();

    render(<AppListboxHarness />);

    await user.click(screen.getByLabelText(/sort galleries by/i));

    const listbox = await screen.findByRole('listbox');
    const style = listbox.getAttribute('style') ?? '';
    expect(style).toContain('min-width: var(--button-width);');
    expect(style).toContain('width: max-content;');
    const optionLabels = screen.getAllByText('Date created');
    expect(optionLabels.at(-1)).toHaveClass('whitespace-nowrap');
  });
});
