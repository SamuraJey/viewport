import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import App, { RouteFallback } from '../../App';
import { LandingPage } from '../../pages/LandingPage';
import { useAuthStore } from '../../stores/authStore';
import { getDemoService } from '../../services/demoService';
import { enableDemoMode } from '../../lib/demoMode';

const mockNavigate = vi.fn();
const mockStoreLogin = vi.fn();

const mockDemoUser = {
  id: 'demo-user-1',
  email: 'demo@viewport.dev',
  display_name: 'Demo User',
  storage_used: 0,
  storage_quota: 1024,
};

const mockDemoTokens = {
  access_token: 'demo-access-token',
  refresh_token: 'demo-refresh-token',
  token_type: 'Bearer',
};

const mockDemoService = {
  getDemoUser: vi.fn(() => mockDemoUser),
  getDemoTokens: vi.fn(() => mockDemoTokens),
};

vi.mock('../../stores/authStore', () => ({
  useAuthStore: vi.fn((selector?: (state: any) => unknown) => {
    const state = {
      login: mockStoreLogin,
      isAuthenticated: false,
      logout: vi.fn(),
      user: null,
      tokens: null,
    };

    return typeof selector === 'function' ? selector(state) : state;
  }),
}));

vi.mock('../../services/demoService', () => ({
  getDemoService: vi.fn(() => mockDemoService),
}));

vi.mock('../../lib/demoMode', () => ({
  enableDemoMode: vi.fn(),
  isDemoModeEnabled: vi.fn(() => false),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('LandingPage and root route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthStore).mockImplementation((selector?: (state: any) => unknown) => {
      const state = {
        login: mockStoreLogin,
        isAuthenticated: false,
        logout: vi.fn(),
        user: null,
        tokens: null,
      };

      return typeof selector === 'function' ? selector(state) : state;
    });
  });

  it('renders LandingPage on / route', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('button', {
        name: /Open demo dashboard/i,
      }),
    ).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Log in/i })).toHaveAttribute('href', '/auth/login');
    expect(screen.getByText('Built for photographers and studios')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /Deliver photo galleries that sell your studio twice/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Viewport gives photographers a polished delivery workflow: fast uploads, beautiful client links/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Why Viewport')).toBeInTheDocument();
    expect(screen.getByText('Northern Editorial')).toBeInTheDocument();
    expect(screen.getByText('Preview ready')).toBeInTheDocument();
  });

  it('opens demo cabinet: enables demo mode, logs in demo user, and navigates to dashboard', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Open demo dashboard/i }));

    await waitFor(() => {
      expect(enableDemoMode).toHaveBeenCalledTimes(1);
      expect(getDemoService).toHaveBeenCalledTimes(1);
      expect(mockDemoService.getDemoUser).toHaveBeenCalledTimes(1);
      expect(mockDemoService.getDemoTokens).toHaveBeenCalledTimes(1);
      expect(mockStoreLogin).toHaveBeenCalledWith(mockDemoUser, mockDemoTokens);
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('announces route loading state accessibly', () => {
    render(<RouteFallback />);

    expect(screen.getByRole('status', { name: /loading page/i })).toBeInTheDocument();
  });
});
