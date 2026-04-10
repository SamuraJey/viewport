import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AccessibilityPage } from '../../pages/AccessibilityPage';
import { useAuthStore } from '../../stores/authStore';

describe('AccessibilityPage', () => {
  afterEach(() => {
    useAuthStore.setState({
      user: null,
      tokens: null,
      isAuthenticated: false,
    });
  });

  it('renders accessibility guidance and low-vision information', () => {
    render(
      <MemoryRouter>
        <AccessibilityPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /accessibility in viewport/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /low-vision mode/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /keyboard shortcuts/i })).toBeInTheDocument();
    expect(screen.queryByText(/accessibility improvements are ongoing/i)).not.toBeInTheDocument();
    expect(document.title).toBe('Accessibility · Viewport');
  });

  it('links authenticated users back to the dashboard', () => {
    useAuthStore.setState({
      user: {
        id: 'user-1',
        email: 'jane@example.com',
        display_name: 'Jane',
        storage_used: 0,
        storage_quota: 0,
      },
      tokens: {
        access_token: 'access',
        refresh_token: 'refresh',
      },
      isAuthenticated: true,
    });

    render(
      <MemoryRouter>
        <AccessibilityPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });
});
