import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from '../../pages/LoginPage';

// Mock the auth service
const mockLogin = vi.fn();
vi.mock('../../services/authService', () => ({
  authService: {
    login: vi.fn(),
  },
}));

// Mock the auth store
const mockStoreLogin = vi.fn();
vi.mock('../../stores/authStore', () => ({
  useAuthStore: vi.fn(() => ({
    login: mockStoreLogin,
    logout: vi.fn(),
    user: null,
    tokens: null,
    isAuthenticated: false,
  })),
}));

const mockNavigate = vi.fn();

// Mock react-router-dom navigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const LoginPageWrapper = ({
  initialRoute = '/auth/login',
  from,
}: {
  initialRoute?: string;
  from?: string;
}) => {
  const state = from ? { from: { pathname: from } } : undefined;
  return (
    <MemoryRouter initialEntries={[{ pathname: initialRoute, state }]}>
      <Routes>
        <Route path="/auth/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    mockLogin.mockClear();
    mockStoreLogin.mockClear();
  });

  it('should render login form correctly', () => {
    render(<LoginPageWrapper />);

    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByText('Sign in to your Viewport account')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText('Create your account')).toBeInTheDocument();
  });

  it('should handle email input changes', async () => {
    const user = userEvent.setup();
    render(<LoginPageWrapper />);

    const emailInput = screen.getByLabelText('Email address');
    await user.type(emailInput, 'test@example.com');

    expect(emailInput).toHaveValue('test@example.com');
  });

  it('should handle password input changes', async () => {
    const user = userEvent.setup();
    render(<LoginPageWrapper />);

    const passwordInput = screen.getByLabelText('Password');
    await user.type(passwordInput, 'password123');

    expect(passwordInput).toHaveValue('password123');
  });

  it('should toggle password visibility', async () => {
    const user = userEvent.setup();
    render(<LoginPageWrapper />);

    const passwordInput = screen.getByLabelText('Password');
    const toggleButton = screen.getByRole('button', { name: '' }); // Toggle button has no name

    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'text');

    await user.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('should validate email format', async () => {
    const user = userEvent.setup();
    render(<LoginPageWrapper />);

    const emailInput = screen.getByLabelText('Email address');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'invalid-email');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    // Should prevent form submission due to validation
    const { authService } = await import('../../services/authService');
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('should require password', async () => {
    const user = userEvent.setup();
    render(<LoginPageWrapper />);

    const emailInput = screen.getByLabelText('Email address');
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.click(submitButton);

    // Should prevent form submission due to validation
    const { authService } = await import('../../services/authService');
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('should handle successful login', async () => {
    const user = userEvent.setup();
    const mockLoginResponse = {
      id: '123',
      email: 'test@example.com',
      display_name: null,
      storage_used: 0,
      storage_quota: 1073741824,
      tokens: { access_token: 'token123', refresh_token: 'refresh123', token_type: 'Bearer' },
    };

    const { authService } = await import('../../services/authService');
    vi.mocked(authService.login).mockResolvedValue(mockLoginResponse);

    render(<LoginPageWrapper />);

    const emailInput = screen.getByLabelText('Email address');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(authService.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    expect(mockStoreLogin).toHaveBeenCalledWith(
      { id: '123', email: 'test@example.com' },
      { access_token: 'token123', refresh_token: 'refresh123', token_type: 'Bearer' },
    );

    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('should redirect to original location after login', async () => {
    const user = userEvent.setup();
    const mockLoginResponse = {
      id: '123',
      email: 'test@example.com',
      display_name: null,
      storage_used: 0,
      storage_quota: 1073741824,
      tokens: { access_token: 'token123', refresh_token: 'refresh123', token_type: 'Bearer' },
    };

    const { authService } = await import('../../services/authService');
    vi.mocked(authService.login).mockResolvedValue(mockLoginResponse);

    render(<LoginPageWrapper from="/galleries" />);

    const emailInput = screen.getByLabelText('Email address');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/galleries', { replace: true });
    });
  });

  it('should handle login error', async () => {
    const user = userEvent.setup();
    const mockError = {
      response: {
        data: {
          detail: 'Invalid credentials',
        },
      },
    };

    const { authService } = await import('../../services/authService');
    vi.mocked(authService.login).mockRejectedValue(mockError);

    render(<LoginPageWrapper />);

    const emailInput = screen.getByLabelText('Email address');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'wrongpassword');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });

    expect(mockStoreLogin).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should handle generic login error', async () => {
    const user = userEvent.setup();

    const { authService } = await import('../../services/authService');
    vi.mocked(authService.login).mockRejectedValue(new Error('Network error'));

    render(<LoginPageWrapper />);

    const emailInput = screen.getByLabelText('Email address');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Login failed. Please try again.')).toBeInTheDocument();
    });
  });

  it('should show loading state during login', async () => {
    const user = userEvent.setup();

    // Create a promise that we can control
    let resolveLogin: (value: any) => void;
    const loginPromise = new Promise((resolve) => {
      resolveLogin = resolve;
    });

    const { authService } = await import('../../services/authService');
    vi.mocked(authService.login).mockReturnValue(loginPromise as any);

    render(<LoginPageWrapper />);

    const emailInput = screen.getByLabelText('Email address');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    // Should show loading state
    expect(screen.getByText('Signing in...')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    // Resolve the login promise
    resolveLogin!({
      id: '123',
      email: 'test@example.com',
      tokens: { access_token: 'token123', refresh_token: 'refresh123', token_type: 'Bearer' },
    });

    await waitFor(() => {
      expect(screen.queryByText('Signing in...')).not.toBeInTheDocument();
    });
  });

  it('should have link to register page', () => {
    render(<LoginPageWrapper />);

    const registerLink = screen.getByText('Create your account');
    expect(registerLink.closest('a')).toHaveAttribute('href', '/auth/register');
  });
});
