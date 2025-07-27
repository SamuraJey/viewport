import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import { useAuthStore } from '../../stores/authStore'

// Mock the auth store
vi.mock('../../stores/authStore')

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>)
}

describe('Layout', () => {
  const mockLogout = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  it('should render children content', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: null,
      logout: mockLogout,
    } as any)

    renderWithRouter(
      <Layout>
        <div>Test content</div>
      </Layout>
    )

    expect(screen.getByText('Test content')).toBeInTheDocument()
  })

  it('should display brand logo and name', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: null,
      logout: mockLogout,
    } as any)

    renderWithRouter(
      <Layout>
        <div>Content</div>
      </Layout>
    )

    expect(screen.getByText('Viewport')).toBeInTheDocument()
    // The Camera icon should be rendered
    expect(screen.getByText('Viewport').closest('a')).toHaveAttribute('href', '/')
  })

  it('should show user email when logged in', () => {
    const mockUser = {
      id: '123',
      email: 'test@example.com',
    }

    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      logout: mockLogout,
    } as any)

    renderWithRouter(
      <Layout>
        <div>Content</div>
      </Layout>
    )

    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })

  it('should show sign out button when logged in', () => {
    const mockUser = {
      id: '123',
      email: 'test@example.com',
    }

    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      logout: mockLogout,
    } as any)

    renderWithRouter(
      <Layout>
        <div>Content</div>
      </Layout>
    )

    expect(screen.getByText('Sign Out')).toBeInTheDocument()
  })

  it('should not show user info when not logged in', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: null,
      logout: mockLogout,
    } as any)

    renderWithRouter(
      <Layout>
        <div>Content</div>
      </Layout>
    )

    expect(screen.queryByText('Sign Out')).not.toBeInTheDocument()
  })

  it('should handle logout when sign out button is clicked', () => {
    const mockUser = {
      id: '123',
      email: 'test@example.com',
    }

    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      logout: mockLogout,
    } as any)

    renderWithRouter(
      <Layout>
        <div>Content</div>
      </Layout>
    )

    const signOutButton = screen.getByText('Sign Out')
    fireEvent.click(signOutButton)

    expect(mockLogout).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/auth/login')
  })

  it('should have correct layout structure', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: null,
      logout: mockLogout,
    } as any)

    renderWithRouter(
      <Layout>
        <div data-testid="content">Content</div>
      </Layout>
    )

    // Should have header
    expect(screen.getByRole('banner')).toBeInTheDocument()
    
    // Should have main content area
    expect(screen.getByTestId('content')).toBeInTheDocument()
  })
})
