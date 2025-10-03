import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authService } from '../services/authService'
import { validateEmail, validatePassword } from '../lib/utils'
import { Eye, EyeOff, UserPlus, Mail, CheckCircle, Camera } from 'lucide-react'
import { AuthLayout } from '../components/AuthLayout'

export const RegisterPage = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
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

    if (!inviteCode.trim()) {
      setError('Invite code is required.')
      return
    }

    setIsLoading(true)

    try {
      await authService.register({ email, password, invite_code: inviteCode })
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
    <div className="bg-surface dark:bg-surface-foreground/95 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-border dark:border-border/10">
      <div className="text-center mb-8">
        <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center mx-auto mb-4">
          <Camera className="h-6 w-6 text-white" />
        </div>
        <h2 className="font-oswald text-3xl font-bold uppercase tracking-wider text-text dark:text-accent-foreground mb-2">
          Create Account
        </h2>
        <p className="text-text-muted dark:text-text font-cuprum">
          Join Viewport and start sharing your moments.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-text dark:text-text mb-2 uppercase tracking-wide">Email Address</label>
          <div className="relative">
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full px-4 py-3 pr-12 bg-surface dark:bg-surface-foreground/80 border-2 border-border dark:border-border text-text dark:text-accent-foreground rounded-lg focus:outline-none focus:border-accent focus:bg-surface dark:focus:bg-surface-foreground focus:ring-4 focus:ring-accent/20 backdrop-blur-sm"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Mail className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-text-muted dark:text-text" />
          </div>
        </div>
        <div>
          <label htmlFor="inviteCode" className="block text-sm font-semibold text-text dark:text-text mb-2 uppercase tracking-wide">Invite Code</label>
          <div className="relative">
            <input
              id="inviteCode"
              name="inviteCode"
              type="text"
              autoComplete="off"
              required
              className="w-full px-4 py-3 bg-surface dark:bg-surface-foreground/80 border-2 border-border dark:border-border text-text dark:text-accent-foreground rounded-lg focus:outline-none focus:border-accent focus:bg-surface dark:focus:bg-surface-foreground focus:ring-4 focus:ring-accent/20 backdrop-blur-sm"
              placeholder="Enter your invite code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-semibold text-text dark:text-text mb-2 uppercase tracking-wide">Password</label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              className="w-full px-4 py-3 pr-12 bg-surface dark:bg-surface-foreground/80 border-2 border-border dark:border-border text-text dark:text-accent-foreground rounded-lg  focus:outline-none focus:border-accent focus:bg-surface dark:focus:bg-surface-foreground focus:ring-4 focus:ring-accent/20 backdrop-blur-sm"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted dark:text-text hover:text-text dark:hover:text-accent-foreground"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (<EyeOff className="h-5 w-5" />) : (<Eye className="h-5 w-5" />)}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-semibold text-text dark:text-text mb-2 uppercase tracking-wide">Confirm Password</label>
          <div className="relative">
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              className="w-full px-4 py-3 pr-12 bg-surface dark:bg-surface-foreground/80 border-2 border-border dark:border-border text-text dark:text-accent-foreground rounded-lg  focus:outline-none focus:border-accent focus:bg-surface dark:focus:bg-surface-foreground focus:ring-4 focus:ring-accent/20 backdrop-blur-sm"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted dark:text-text hover:text-text dark:hover:text-accent-foreground "
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              {showConfirmPassword ? (<EyeOff className="h-5 w-5" />) : (<Eye className="h-5 w-5" />)}
            </button>
          </div>
          <p className="text-xs text-text-muted dark:text-text mt-2">Password must be at least 8 characters long.</p>
        </div>
        {error && (<div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-center text-sm">{error}</div>)}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-accent text-accent-foreground font-semibold py-3 px-6 rounded-lg  hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/25 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              Creating account...
            </>
          ) : (
            <>
              <UserPlus className="h-5 w-5" />
              Create Account
            </>
          )}
        </button>
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border dark:border-border"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-surface dark:bg-surface-foreground text-text-muted dark:text-text">Already have an account?</span>
          </div>
        </div>
        <div className="text-center">
          <Link
            to="/auth/login"
            className="inline-flex items-center text-sm font-medium text-text dark:text-accent-foreground hover:text-accent dark:hover:text-accent-foreground"
          >
            Sign in to your account
          </Link>
        </div>
      </form>
    </div>
  )

  const renderSuccess = () => (
    <div className="relative z-10 w-full max-w-md p-8 flex flex-col gap-6 bg-surface dark:bg-surface-foreground/95 backdrop-blur-lg rounded-xl border border-border dark:border-white/10 text-center">
      <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
      <h2 className="text-3xl font-bold text-text dark:text-white">
        Registration Successful!
      </h2>
      <p className="text-lg text-text-muted dark:text-text">
        Redirecting you to sign in...
      </p>
    </div>
  )

  return (
    <AuthLayout>
      <div className="relative w-full max-w-md">
        {success ? renderSuccess() : renderForm()}
      </div>
    </AuthLayout>
  )
}
