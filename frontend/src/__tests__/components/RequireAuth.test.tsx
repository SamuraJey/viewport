import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { RequireAuth } from '../../components/RequireAuth'
import { useAuthStore } from '../../stores/authStore'
import { BrowserRouter } from 'react-router-dom'

// Mock the auth store
vi.mock('../../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}))

// Mock react-router-dom Navigate component
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    Navigate: ({ to, state, replace }: any) => {
      mockNavigate(to, { state, replace })
      return <div data-testid="navigate" />
    },
    useLocation: () => ({ pathname: '/protected', search: '' }),
  }
})

const mockUseAuthStore = vi.mocked(useAuthStore)

describe('RequireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderWithRouter = (children: React.ReactNode) => {
    return render(
      <BrowserRouter>
        {children}
      </BrowserRouter>
    )
  }

  it('should render children when user is authenticated', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: { id: '1', email: 'test@example.com' },
      tokens: null,
      login: vi.fn(),
      logout: vi.fn(),
      updateTokens: vi.fn(),
    })

    const { getByText } = renderWithRouter(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>
    )

    expect(getByText('Protected Content')).toBeInTheDocument()
  })

  it('should redirect to login when user is not authenticated', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: false,
      user: null,
      tokens: null,
      login: vi.fn(),
      logout: vi.fn(),
      updateTokens: vi.fn(),
    })

    const { queryByText, getByTestId } = renderWithRouter(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>
    )

    expect(queryByText('Protected Content')).not.toBeInTheDocument()
    expect(getByTestId('navigate')).toBeInTheDocument()
    expect(mockNavigate).toHaveBeenCalledWith('/auth/login', {
      state: { from: { pathname: '/protected', search: '' } },
      replace: true
    })
  })

  it('should preserve current location in state for redirect after login', () => {
    // Mock different location
    vi.doMock('react-router-dom', async () => {
      const actual = await vi.importActual('react-router-dom')
      return {
        ...actual,
        Navigate: ({ to, state, replace }: any) => {
          mockNavigate(to, { state, replace })
          return <div data-testid="navigate" />
        },
        useLocation: () => ({ pathname: '/protected-page', search: '?param=value' }),
      }
    })

    mockUseAuthStore.mockReturnValue({
      isAuthenticated: false,
      user: null,
      tokens: null,
      login: vi.fn(),
      logout: vi.fn(),
      updateTokens: vi.fn(),
    })

    renderWithRouter(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>
    )

    expect(mockNavigate).toHaveBeenCalledWith('/auth/login', { 
      state: { from: { pathname: '/protected', search: '' } },
      replace: true
    })
  })

  it('should handle authentication state change', () => {
    // First render with unauthenticated state
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: false,
      user: null,
      tokens: null,
      login: vi.fn(),
      logout: vi.fn(),
      updateTokens: vi.fn(),
    })

    const { rerender, queryByText, queryByTestId } = renderWithRouter(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>
    )

    expect(queryByText('Protected Content')).not.toBeInTheDocument()
    expect(queryByTestId('navigate')).toBeInTheDocument()

    // Re-render with authenticated state
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: { id: '1', email: 'test@example.com' },
      tokens: { access_token: 'token', refresh_token: 'refresh', token_type: 'Bearer' },
      login: vi.fn(),
      logout: vi.fn(),
      updateTokens: vi.fn(),
    })

    rerender(
      <BrowserRouter>
        <RequireAuth>
          <div>Protected Content</div>
        </RequireAuth>
      </BrowserRouter>
    )

    expect(queryByText('Protected Content')).toBeInTheDocument()
    expect(queryByTestId('navigate')).not.toBeInTheDocument()
  })

  it('should work with different children components', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: { id: '1', email: 'test@example.com' },
      tokens: null,
      login: vi.fn(),
      logout: vi.fn(),
      updateTokens: vi.fn(),
    })

    const { getByText } = renderWithRouter(
      <RequireAuth>
        <div>
          <h1>Dashboard</h1>
          <p>Welcome to your dashboard</p>
        </div>
      </RequireAuth>
    )

    expect(getByText('Dashboard')).toBeInTheDocument()
    expect(getByText('Welcome to your dashboard')).toBeInTheDocument()
  })
})
