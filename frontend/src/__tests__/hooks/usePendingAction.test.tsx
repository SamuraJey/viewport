import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { usePendingAction } from '../../hooks/usePendingAction';
import type { PendingAction } from '../../components/command/commandActions';

vi.mock('../../components/command/commandActions', () => ({
  consumePendingAction: vi.fn(),
}));

import { consumePendingAction } from '../../components/command/commandActions';

interface HarnessProps {
  onAction: (action: PendingAction) => void;
  navigateTo: string;
}

// Renders the hook plus a button that triggers a same-path navigation so the
// location.key changes without unmounting the route component.
const Harness = ({ onAction, navigateTo }: HarnessProps) => {
  usePendingAction(onAction);
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(navigateTo)} data-testid="nav">
      navigate
    </button>
  );
};

const renderHarness = (onAction: ReturnType<typeof vi.fn>, navigateTo = '/dashboard') =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Harness onAction={onAction} navigateTo={navigateTo} />
    </MemoryRouter>,
  );

describe('usePendingAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('consumes a pending action on mount', () => {
    vi.mocked(consumePendingAction).mockReturnValue('create-project');
    const onAction = vi.fn();
    renderHarness(onAction);
    expect(consumePendingAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('create-project');
  });

  it('does not invoke the callback when no action is pending', () => {
    vi.mocked(consumePendingAction).mockReturnValue(null);
    const onAction = vi.fn();
    renderHarness(onAction);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('re-consumes on same-path navigation (new location key)', () => {
    // Mount: nothing pending. After a same-path PUSH navigation: action pending.
    vi.mocked(consumePendingAction).mockReturnValueOnce(null).mockReturnValueOnce('create-project');
    const onAction = vi.fn();
    const { getByTestId } = renderHarness(onAction, '/dashboard');
    expect(onAction).not.toHaveBeenCalled();

    act(() => getByTestId('nav').click());
    expect(consumePendingAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenCalledWith('create-project');
  });

  it('does not re-fire on re-render without navigation', () => {
    vi.mocked(consumePendingAction).mockReturnValue('create-project');
    const onAction = vi.fn();
    const { rerender } = renderHarness(onAction);
    expect(onAction).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Harness onAction={onAction} navigateTo="/dashboard" />
      </MemoryRouter>,
    );
    // No new navigation → no second consumption.
    expect(consumePendingAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
