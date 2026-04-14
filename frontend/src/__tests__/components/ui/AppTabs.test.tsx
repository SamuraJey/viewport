import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppTabs } from '../../../components/ui';

const AppTabsFormHarness = ({ onSubmit }: { onSubmit: () => void }) => {
  const [selectedKey, setSelectedKey] = useState<'first' | 'second'>('first');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <AppTabs
        selectedKey={selectedKey}
        onChange={setSelectedKey}
        items={[
          {
            key: 'first',
            tab: 'First tab',
            panel: <div>First panel</div>,
          },
          {
            key: 'second',
            tab: 'Second tab',
            panel: <div>Second panel</div>,
          },
        ]}
      />
      <button type="submit">Submit form</button>
    </form>
  );
};

describe('AppTabs', () => {
  it('does not submit a parent form when a tab trigger is clicked', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    render(<AppTabsFormHarness onSubmit={handleSubmit} />);

    await user.click(screen.getByRole('tab', { name: /second tab/i }));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Second panel')).toBeInTheDocument();
  });

  it('unmounts inactive panels by default', () => {
    render(
      <AppTabs
        selectedKey="first"
        onChange={() => {}}
        items={[
          {
            key: 'first',
            tab: 'First tab',
            panel: <div>First panel</div>,
          },
          {
            key: 'second',
            tab: 'Second tab',
            panel: <div>Second panel</div>,
          },
        ]}
      />,
    );

    expect(screen.getByText('First panel')).toBeInTheDocument();
    expect(screen.queryByText('Second panel')).not.toBeInTheDocument();
  });

  it('can preserve inactive panels when explicitly requested', () => {
    render(
      <AppTabs
        selectedKey="first"
        onChange={() => {}}
        preserveInactivePanels
        items={[
          {
            key: 'first',
            tab: 'First tab',
            panel: <div>First panel</div>,
          },
          {
            key: 'second',
            tab: 'Second tab',
            panel: <div>Second panel</div>,
          },
        ]}
      />,
    );

    expect(screen.getByText('First panel')).toBeInTheDocument();
    expect(screen.getByText('Second panel')).toBeInTheDocument();
  });
});
