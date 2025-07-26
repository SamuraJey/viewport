import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authService } from '../services/authService'
import { validateEmail, validatePassword } from '../lib/utils'
import { Eye, EyeOff, Loader2, UserPlus, Mail, CheckCircle } from 'lucide-react'

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
    <div className="relative z-10 w-full max-w-md p-8 space-y-6 bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white">Create Account</h1>
        <p className="mt-2 text-gray-300">
          Join Viewport and start sharing your moments.
        </p>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 pr-4 py-3 block w-full bg-gray-700/50 text-white border border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              placeholder="Email address"
            />
          </div>
          
          <div className="relative">
            <Eye className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 pr-10 py-3 block w-full bg-gray-700/50 text-white border border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              placeholder="Create a password"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5 text-gray-400" />
              ) : (
                <Eye className="h-5 w-5 text-gray-400" />
              )}
            </button>
          </div>
          
          <div className="relative">
            <Eye className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 pr-10 py-3 block w-full bg-gray-700/50 text-white border border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              placeholder="Confirm your password"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              {showConfirmPassword ? (
                <EyeOff className="h-5 w-5 text-gray-400" />
              ) : (
                <Eye className="h-5 w-5 text-gray-400" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400">Password must be at least 8 characters long.</p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg text-white font-semibold bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <UserPlus className="h-5 w-5" />
                Create Account
              </>
            )}
          </button>
        </div>
      </form>
      
      <p className="text-center text-sm text-gray-300">
        Already have an account?{' '}
        <Link
          to="/auth/login"
          className="font-medium text-blue-400 hover:text-blue-300"
        >
          Sign In
        </Link>
      </p>
    </div>
  )

  const renderSuccess = () => (
    <div className="relative z-10 w-full max-w-md p-8 space-y-6 bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl text-center">
      <CheckCircle className="mx-auto h-16 w-16 text-green-400" />
      <h2 className="mt-6 text-3xl font-bold text-white">
        Registration Successful!
      </h2>
      <p className="mt-2 text-lg text-gray-300">
        Redirecting you to sign in...
      </p>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white overflow-hidden p-4">
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-purple-600 rounded-full mix-blend-screen filter blur-xl opacity-50 animate-blob"></div>
        <div className="absolute top-1/2 right-1/4 w-72 h-72 bg-blue-600 rounded-full mix-blend-screen filter blur-xl opacity-50 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-1/4 left-1/2 w-72 h-72 bg-pink-600 rounded-full mix-blend-screen filter blur-xl opacity-50 animate-blob animation-delay-4000"></div>
      </div>
      {success ? renderSuccess() : renderForm()}
    </div>
  )
}
