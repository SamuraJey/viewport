import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { CalendarField } from '../../../components/ui/CalendarField';

it('selects a leap day with the keyboard while keeping the expiration time in UTC', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <CalendarField
      id="expiration"
      label="Expiration"
      value="2024-03-01T23:59"
      withTime
      onChange={onChange}
    />,
  );
  const trigger = screen.getByRole('button', { name: /Expiration/ });
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(16, 16, 160, 44));
  await user.click(trigger);
  const selected = screen.getByRole('button', { pressed: true });
  selected.focus();
  await user.keyboard('{ArrowLeft}{Enter}');
  expect(onChange).toHaveBeenCalledWith('2024-02-29T23:59');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.change(screen.getByLabelText('Expiration time in UTC'), { target: { value: '08:15' } });
  expect(onChange).toHaveBeenCalledWith('2024-03-01T08:15');
});

it('jumps by month, browses year choices, and accepts a typed year without submitting the form', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const onSubmit = vi.fn((event) => event.preventDefault());
  render(
    <form onSubmit={onSubmit}>
      <CalendarField id="shoot" label="Shooting date" value="2026-04-03" onChange={onChange} />
      <button type="submit">Save</button>
    </form>,
  );
  const trigger = screen.getByRole('button', { name: /Shooting date/ });
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(16, 16, 160, 44));
  await user.click(trigger);

  const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' });
  const monthTrigger = screen.getByRole('button', { name: /Change month/ });
  await user.click(monthTrigger);
  const months = within(screen.getByRole('group', { name: 'Choose month' }));
  expect(months.getAllByRole('button')).toHaveLength(12);
  expect(months.getByRole('button', { pressed: true })).toHaveTextContent(
    monthFormat.format(new Date('2026-04-01')),
  );
  await user.click(
    months.getByRole('button', { name: monthFormat.format(new Date('2026-02-01')) }),
  );
  expect(monthTrigger).toHaveFocus();

  const yearTrigger = screen.getByRole('button', { name: 'Change year, 2026' });
  await user.click(yearTrigger);
  await user.click(screen.getByRole('button', { name: 'Previous years' }));
  await user.click(screen.getByRole('button', { name: '2020' }));
  expect(yearTrigger).toHaveAccessibleName('Change year, 2020');
  expect(yearTrigger).toHaveFocus();

  await user.click(yearTrigger);
  const yearInput = screen.getByRole('textbox', { name: 'Year' });
  await user.clear(yearInput);
  await user.type(yearInput, '0{Enter}');
  expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled();
  await user.clear(yearInput);
  await user.type(yearInput, '2000{Enter}');
  expect(onSubmit).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();

  const leapDay = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeZone: 'UTC' }).format(
    new Date('2000-02-29'),
  );
  await user.click(screen.getByRole('button', { name: leapDay }));
  expect(onChange).toHaveBeenCalledWith('2000-02-29');
});
