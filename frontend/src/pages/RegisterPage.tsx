import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authService } from '../services/authService'
import { validateEmail, validatePassword } from '../lib/utils'
import { Eye, EyeOff, UserPlus, Mail, CheckCircle, Camera } from 'lucide-react'

export const RegisterPage = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!validateEmail(email)) {
      setError('Please enter a valid email address.')
      return
    }
    
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.isValid) {
      setError(passwordValidation.errors[0])
      return
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    
    setIsLoading(true)
    
    try {
      await authService.register({ email, password })
      setSuccess(true)
      setTimeout(() => {
        navigate('/auth/login', { 
          state: { message: 'Registration successful! Please sign in.' }
        })
      }, 2000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const renderForm = () => (
    <div className="modern-form" style={{ maxWidth: 'none' }}>
      <div className="text-center mb-8">
        <div style={{ margin: '0 auto 1rem', height: '3rem', width: '3rem', background: 'linear-gradient(to right, #2563eb, #7c3aed)', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Camera style={{ height: '1.5rem', width: '1.5rem', color: '#fff' }} />
        </div>
        <h2 className="modern-heading" style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>
          Create Account
        </h2>
        <p className="modern-subheading">
          Join Viewport and start sharing your moments.
        </p>
      </div>
      <form style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email" className="form-label">Email Address</label>
          <div style={{ position: 'relative' }}>
            <input id="email" name="email" type="email" autoComplete="email" required className="form-input" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ paddingRight: '3rem' }} />
            <Mail style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', height: '1.25rem', width: '1.25rem', color: '#9ca3af' }} />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="password" className="form-label">Password</label>
          <div style={{ position: 'relative' }}>
            <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required className="form-input" placeholder="Create a password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: '3rem' }} />
            <button type="button" style={{ position: 'absolute', top: '50%', right: '0.75rem', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0 }} onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? (<EyeOff style={{ height: '1.25rem', width: '1.25rem' }} />) : (<Eye style={{ height: '1.25rem', width: '1.25rem' }} />)}
            </button>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="confirmPassword" className="form-label">Confirm Password</label>
          <div style={{ position: 'relative' }}>
            <input id="confirmPassword" name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" required className="form-input" placeholder="Confirm your password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={{ paddingRight: '3rem' }} />
            <button type="button" style={{ position: 'absolute', top: '50%', right: '0.75rem', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0 }} onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
              {showConfirmPassword ? (<EyeOff style={{ height: '1.25rem', width: '1.25rem' }} />) : (<Eye style={{ height: '1.25rem', width: '1.25rem' }} />)}
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>Password must be at least 8 characters long.</p>
        </div>
        {error && (<div className="error-message">{error}</div>)}
        <button type="submit" disabled={isLoading} className="modern-btn w-full" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: isLoading ? 0.6 : 1 }}>
          {isLoading ? (<><div className="loading-spinner" style={{ width: '1.25rem', height: '1.25rem', marginRight: '0.5rem' }}></div>Creating account...</>) : (<><UserPlus style={{ height: '1.25rem', width: '1.25rem', marginRight: '0.5rem' }} />Create Account</>)}
        </button>
        <div style={{ position: 'relative', margin: '1rem 0' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '100%', borderTop: '1px solid #4b5563' }}></div>
          </div>
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', fontSize: '0.875rem' }}>
            <span style={{ padding: '0 1rem', background: '#2a2a2a', color: '#9ca3af' }}>Already have an account?</span>
          </div>
        </div>
        <div className="text-center">
          <Link to="/auth/login" style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.875rem', fontWeight: 500, color: '#fff', textDecoration: 'none' }} className="hover:opacity-75 transition-all">Sign in to your account</Link>
        </div>
      </form>
    </div>
  )

  const renderSuccess = () => (
    <div style={{ 
      position: 'relative', 
      zIndex: 10, 
      width: '100%', 
      maxWidth: '28rem', 
      padding: '2rem', 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '1.5rem', 
      background: 'rgba(42, 42, 42, 0.95)', 
      backdropFilter: 'blur(10px)', 
      borderRadius: '12px', 
      border: '1px solid rgba(255, 255, 255, 0.1)', 
      textAlign: 'center' 
    }}>
      <CheckCircle style={{ margin: '0 auto', height: '4rem', width: '4rem', color: '#22c55e' }} />
      <h2 style={{ marginTop: '1.5rem', fontSize: '1.875rem', fontWeight: 'bold', color: '#fff' }}>
        Registration Successful!
      </h2>
      <p style={{ marginTop: '0.5rem', fontSize: '1.125rem', color: '#d1d5db' }}>
        Redirecting you to sign in...
      </p>
    </div>
  )

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
        {success ? renderSuccess() : renderForm()}
      </div>
    </div>
  )
}
