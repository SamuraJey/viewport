import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Import components under test
import { ErrorDisplay, NetworkStatus } from '../../../src/components/ErrorDisplay';

describe('ErrorDisplay component', () => {
  it('renders inline variant with message and dismiss/retry actions', async () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();

    render(
      <ErrorDisplay
        error="Something went wrong"
        onRetry={onRetry}
        onDismiss={onDismiss}
        variant="inline"
      />,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    const dismiss = screen.getByRole('button', { name: /dismiss/i });
    await userEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalled();

    const retry = screen.getByRole('button', { name: /retry/i });
    await userEvent.click(retry);
    expect(onRetry).toHaveBeenCalled();
  });

  it('renders card variant with title, try again and dismiss buttons', async () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();

    render(
      <ErrorDisplay error="Fatal error" onRetry={onRetry} onDismiss={onDismiss} variant="card" />,
    );

    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Fatal error')).toBeInTheDocument();

    const tryAgain = screen.getByRole('button', { name: /try again/i });
    await userEvent.click(tryAgain);
    expect(onRetry).toHaveBeenCalled();

    const dismiss = screen.getByRole('button', { name: /dismiss/i });
    await userEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalled();
  });

  it('renders inline variant without actions when handlers not provided', () => {
    render(<ErrorDisplay error="No actions" variant="inline" />);

    expect(screen.getByText('No actions')).toBeInTheDocument();
    // Buttons should not exist
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });
});

describe('NetworkStatus component', () => {
  const realNavigator = { ...global.navigator } as any;

  afterEach(() => {
    // restore original navigator
    Object.defineProperty(global, 'navigator', {
      value: realNavigator,
      configurable: true,
    });
  });

  it('returns null when online and shows banner when offline (reactive)', async () => {
    Object.defineProperty(global, 'navigator', { value: { onLine: true }, configurable: true });
    const { container } = render(<NetworkStatus />);
    expect(container.firstChild).toBeNull();

    // simulate going offline
    Object.defineProperty(global, 'navigator', { value: { onLine: false }, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(
      screen.getByText("You're currently offline. Some features may not work properly."),
    ).toBeInTheDocument();

    // mock reload and click retry
    const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => undefined);
    const retry = screen.getByRole('button', { name: /retry/i });
    await userEvent.click(retry);
    expect(reloadSpy).toHaveBeenCalled();
    reloadSpy.mockRestore();

    // simulate going back online
    Object.defineProperty(global, 'navigator', { value: { onLine: true }, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(
      screen.queryByText("You're currently offline. Some features may not work properly."),
    ).toBeNull();
  });
});
