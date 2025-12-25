import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ErrorPage } from '../../pages/ErrorPage';

describe('ErrorPage', () => {
  it('shows status-specific content and home link', () => {
    render(
      <MemoryRouter>
        <ErrorPage statusCode={404} />
      </MemoryRouter>,
    );

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/');
    expect(screen.getByText(/Page Not Found/i)).toBeInTheDocument();
  });

  it('fires retry callback when provided', async () => {
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <ErrorPage statusCode={503} onRetry={onRetry} showBackButton={false} />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
