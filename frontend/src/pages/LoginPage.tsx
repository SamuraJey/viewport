import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { authService } from '../services/authService'
import { useAuthStore } from '../stores/authStore'
import { validateEmail } from '../lib/utils'
import { Eye, EyeOff, Camera, Mail, LogIn, UserPlus } from 'lucide-react'

export const LoginPage = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuthStore()
  
  const from = location.state?.from?.pathname || '/'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!validateEmail(email)) {
      setError('Please enter a valid email address')
      return
    }
    
    if (!password) {
      setError('Password is required')
      return
    }
    
    setIsLoading(true)
    
    try {
      const response = await authService.login({ email, password })
      login(
        { id: response.id, email: response.email },
        response.tokens
      )
      navigate(from, { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#1e1e1e', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '3rem 1rem' 
    }}>
      <div style={{ position: 'relative', maxWidth: '28rem', width: '100%' }}>
        {/* Card container */}
        <div className="modern-form" style={{ maxWidth: 'none' }}>
          {/* Logo/Brand area */}
          <div className="text-center mb-8">
            <div style={{ 
              margin: '0 auto 1rem', 
              height: '3rem', 
              width: '3rem', 
              background: 'linear-gradient(to right, #2563eb, #7c3aed)', 
              borderRadius: '0.75rem', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <Camera style={{ height: '1.5rem', width: '1.5rem', color: '#fff' }} />
            </div>
            <h2 className="modern-heading" style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>
              Welcome back
            </h2>
            <p className="modern-subheading">
              Sign in to your Viewport account
            </p>
          </div>

          <form style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} onSubmit={handleSubmit}>
            {/* Email Field */}
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email address
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="form-input"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ paddingRight: '3rem' }}
                />
                <Mail style={{ 
                  position: 'absolute', 
                  right: '0.75rem', 
                  top: '50%', 
                  transform: 'translateY(-50%)',
                  height: '1.25rem', 
                  width: '1.25rem', 
                  color: '#9ca3af' 
                }} />
              </div>
            </div>

            {/* Password Field */}
            <div className="form-group">
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="form-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: '3rem' }}
                />
                <button
                  type="button"
                  style={{ 
                    position: 'absolute',
                    top: '50%',
                    right: '0.75rem',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    padding: 0
                  }}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff style={{ height: '1.25rem', width: '1.25rem' }} />
                  ) : (
                    <Eye style={{ height: '1.25rem', width: '1.25rem' }} />
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="modern-btn w-full"
              style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                opacity: isLoading ? 0.6 : 1
              }}
            >
              {isLoading ? (
                <>
                  <div className="loading-spinner" style={{ width: '1.25rem', height: '1.25rem', marginRight: '0.5rem' }}></div>
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn style={{ height: '1.25rem', width: '1.25rem', marginRight: '0.5rem' }} />
                  Sign in
                </>
              )}
            </button>

            {/* Divider */}
            <div style={{ position: 'relative', margin: '1rem 0' }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '100%', borderTop: '1px solid #4b5563' }}></div>
              </div>
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', fontSize: '0.875rem' }}>
                <span style={{ padding: '0 1rem', background: '#2a2a2a', color: '#9ca3af' }}>New to Viewport?</span>
              </div>
            </div>

            {/* Register Link */}
            <div className="text-center">
              <Link
                to="/auth/register"
                style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  fontSize: '0.875rem', 
                  fontWeight: 500, 
                  color: '#fff',
                  textDecoration: 'none'
                }}
                className="hover:opacity-75 transition-all"
              >
                <UserPlus style={{ height: '1rem', width: '1rem', marginRight: '0.25rem' }} />
                Create your account
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
