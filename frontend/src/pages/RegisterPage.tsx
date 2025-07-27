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
    <div className="bg-gray-900/95 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/10">
      <div className="text-center mb-8">
        <div className="w-12 h-12 bg-gradient-to-r from-primary-600 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Camera className="h-6 w-6 text-white" />
        </div>
        <h2 className="font-oswald text-3xl font-bold uppercase tracking-wider text-white mb-2">
          Create Account
        </h2>
        <p className="text-gray-400 font-cuprum">
          Join Viewport and start sharing your moments.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wide">Email Address</label>
          <div className="relative">
            <input 
              id="email" 
              name="email" 
              type="email" 
              autoComplete="email" 
              required 
              className="w-full px-4 py-3 pr-12 bg-gray-800/80 border-2 border-gray-600 text-white rounded-lg transition-all focus:outline-none focus:border-primary-500 focus:bg-gray-800 focus:ring-4 focus:ring-primary-500/20 backdrop-blur-sm" 
              placeholder="Enter your email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
            />
            <Mail className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          </div>
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wide">Password</label>
          <div className="relative">
            <input 
              id="password" 
              name="password" 
              type={showPassword ? 'text' : 'password'} 
              autoComplete="new-password" 
              required 
              className="w-full px-4 py-3 pr-12 bg-gray-800/80 border-2 border-gray-600 text-white rounded-lg transition-all focus:outline-none focus:border-primary-500 focus:bg-gray-800 focus:ring-4 focus:ring-primary-500/20 backdrop-blur-sm" 
              placeholder="Create a password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
            />
            <button 
              type="button" 
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors" 
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (<EyeOff className="h-5 w-5" />) : (<Eye className="h-5 w-5" />)}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wide">Confirm Password</label>
          <div className="relative">
            <input 
              id="confirmPassword" 
              name="confirmPassword" 
              type={showConfirmPassword ? 'text' : 'password'} 
              autoComplete="new-password" 
              required 
              className="w-full px-4 py-3 pr-12 bg-gray-800/80 border-2 border-gray-600 text-white rounded-lg transition-all focus:outline-none focus:border-primary-500 focus:bg-gray-800 focus:ring-4 focus:ring-primary-500/20 backdrop-blur-sm" 
              placeholder="Confirm your password" 
              value={confirmPassword} 
              onChange={(e) => setConfirmPassword(e.target.value)} 
            />
            <button 
              type="button" 
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors" 
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              {showConfirmPassword ? (<EyeOff className="h-5 w-5" />) : (<Eye className="h-5 w-5" />)}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">Password must be at least 8 characters long.</p>
        </div>
        {error && (<div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-center text-sm">{error}</div>)}
        <button 
          type="submit" 
          disabled={isLoading} 
          className="w-full bg-gradient-to-r from-primary-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-lg transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
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
            <div className="w-full border-t border-gray-600"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-gray-900 text-gray-400">Already have an account?</span>
          </div>
        </div>
        <div className="text-center">
          <Link 
            to="/auth/login" 
            className="inline-flex items-center text-sm font-medium text-white hover:text-primary-400 transition-colors"
          >
            Sign in to your account
          </Link>
        </div>
      </form>
    </div>
  )

  const renderSuccess = () => (
    <div className="relative z-10 w-full max-w-md p-8 flex flex-col gap-6 bg-gray-800/95 backdrop-blur-lg rounded-xl border border-white/10 text-center">
      <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
      <h2 className="text-3xl font-bold text-white">
        Registration Successful!
      </h2>
      <p className="text-lg text-gray-300">
        Redirecting you to sign in...
      </p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        {success ? renderSuccess() : renderForm()}
      </div>
    </div>
  )
}
