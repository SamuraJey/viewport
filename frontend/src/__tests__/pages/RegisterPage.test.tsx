import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RegisterPage } from '../../pages/RegisterPage'
import { authService } from '../../services/authService'

// Mock the auth service
vi.mock('../../services/authService', () => ({
  authService: {
    register: vi.fn()
  }
}))

const mockNavigate = vi.fn()

// Mock react-router-dom navigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const RegisterPageWrapper = () => {
  return (
    <MemoryRouter initialEntries={['/auth/register']}>
      <Routes>
        <Route path="/auth/register" element={<RegisterPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render registration form correctly', () => {
    render(<RegisterPageWrapper />)
    
    expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument()
    expect(screen.getByText('Join Viewport and start sharing your moments.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument()
  })

  it('should handle form input correctly', async () => {
    render(<RegisterPageWrapper />)
    
    const emailInput = screen.getByLabelText('Email Address')
    const passwordInput = screen.getByLabelText(/^Password$/)
    const confirmPasswordInput = screen.getByLabelText('Confirm Password')
    
    await userEvent.type(emailInput, 'test@example.com')
    await userEvent.type(passwordInput, 'password123')
    await userEvent.type(confirmPasswordInput, 'password123')
    
    expect(emailInput).toHaveValue('test@example.com')
    expect(passwordInput).toHaveValue('password123')
    expect(confirmPasswordInput).toHaveValue('password123')
  })

  it('should toggle password visibility', async () => {
    render(<RegisterPageWrapper />)
    
    const passwordInput = screen.getByLabelText(/^Password$/)
    const passwordToggle = passwordInput.parentElement?.querySelector('button')
    
    expect(passwordInput).toHaveAttribute('type', 'password')
    
    if (passwordToggle) {
      await userEvent.click(passwordToggle)
      expect(passwordInput).toHaveAttribute('type', 'text')
      
      await userEvent.click(passwordToggle)
      expect(passwordInput).toHaveAttribute('type', 'password')
    }
  })

  it('should show password validation message', () => {
    render(<RegisterPageWrapper />)
    
    expect(screen.getByText('Password must be at least 8 characters long.')).toBeInTheDocument()
  })

  it('should validate email format', async () => {
    render(<RegisterPageWrapper />)
    
    const emailInput = screen.getByLabelText('Email Address')
    const passwordInput = screen.getByLabelText(/^Password$/)
    const confirmPasswordInput = screen.getByLabelText('Confirm Password')
    const submitButton = screen.getByRole('button', { name: 'Create Account' })
    
    // Type invalid email and valid passwords
    await userEvent.type(emailInput, 'invalid-email')
    await userEvent.type(passwordInput, 'validPassword123')
    await userEvent.type(confirmPasswordInput, 'validPassword123')
    
    // Click submit button
    await userEvent.click(submitButton)
    
    // Should not call register service with invalid email
    const { authService } = await import('../../services/authService')
    expect(authService.register).not.toHaveBeenCalled()
  })

  it('should validate password strength', async () => {
    const user = userEvent.setup()
    render(<RegisterPageWrapper />)
    
    const emailInput = screen.getByLabelText('Email Address')
    const passwordInput = screen.getByLabelText(/^Password$/)
    const confirmPasswordInput = screen.getByLabelText('Confirm Password')
    const submitButton = screen.getByRole('button', { name: /create account/i })
    
    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'weak')
    await user.type(confirmPasswordInput, 'weak')
    await user.click(submitButton)
    
    const { authService } = await import('../../services/authService')
    expect(authService.register).not.toHaveBeenCalled()
  })

  it('should validate password match', async () => {
    render(<RegisterPageWrapper />)
    
    const emailInput = screen.getByLabelText('Email Address')
    const passwordInput = screen.getByLabelText(/^Password$/)
    const confirmPasswordInput = screen.getByLabelText('Confirm Password')
    const submitButton = screen.getByRole('button', { name: 'Create Account' })
    
    await userEvent.type(emailInput, 'test@example.com')
    await userEvent.type(passwordInput, 'password123')
    await userEvent.type(confirmPasswordInput, 'differentpassword')
    await userEvent.click(submitButton)
    
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
  })

  it('should handle successful registration', async () => {
    const mockRegister = vi.mocked(authService.register).mockResolvedValue({
      id: '1',
      email: 'test@example.com'
    })
    
    render(<RegisterPageWrapper />)
    
    const emailInput = screen.getByLabelText('Email Address')
    const passwordInput = screen.getByLabelText(/^Password$/)
    const confirmPasswordInput = screen.getByLabelText('Confirm Password')
    const submitButton = screen.getByRole('button', { name: 'Create Account' })
    
    await userEvent.type(emailInput, 'test@example.com')
    await userEvent.type(passwordInput, 'password123')
    await userEvent.type(confirmPasswordInput, 'password123')
    await userEvent.click(submitButton)
    
    expect(mockRegister).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123'
    })
    
    await waitFor(() => {
      expect(screen.getByText('Registration Successful!')).toBeInTheDocument()
    })
  })

  it('should handle registration error', async () => {
    const user = userEvent.setup()
    const mockError = {
      response: {
        data: {
          detail: 'Email already exists'
        }
      }
    }
    
    const { authService } = await import('../../services/authService')
    vi.mocked(authService.register).mockRejectedValue(mockError)
    
    render(<RegisterPageWrapper />)
    
    const emailInput = screen.getByLabelText('Email Address')
    const passwordInput = screen.getByLabelText(/^Password$/)
    const confirmPasswordInput = screen.getByLabelText('Confirm Password')
    const submitButton = screen.getByRole('button', { name: /create account/i })
    
    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'Password123!')
    await user.type(confirmPasswordInput, 'Password123!')
    await user.click(submitButton)
    
    await waitFor(() => {
      expect(screen.getByText('Email already exists')).toBeInTheDocument()
    })
  })

  it('should have link to login page', () => {
    render(<RegisterPageWrapper />)
    
    const loginLink = screen.getByText('Sign in to your account')
    expect(loginLink.closest('a')).toHaveAttribute('href', '/auth/login')
  })
})
