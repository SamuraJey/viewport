import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useTheme } from '../hooks/useTheme'
import { ThemeSwitch } from './ThemeSwitch'
import { LogOut, User, Camera } from 'lucide-react'

interface LayoutProps {
  children: ReactNode
}

export const Layout = ({ children }: LayoutProps) => {
  const { user, logout } = useAuthStore()
  // Determine current theme from <html> class
  // React state for theme
  const { theme } = useTheme()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/auth/login')
  }

  return (
    <div className={`min-h-screen text-gray-900 dark:text-white ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'}`}>
      {/* Fixed theme toggle button for all pages */}
      <ThemeSwitch />

      <header className={`sticky top-0 z-40 backdrop-blur-lg border-b py-4 ${theme === 'dark' ? 'bg-gray-900/95 border-white/10' : 'bg-white/95 border-gray-200'}`}>
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center">
            <Link
              to="/"
              className="flex items-center gap-3 text-gray-900 dark:text-white hover:opacity-80 transition-opacity font-oswald text-xl font-bold uppercase tracking-wider"
            >
              <Camera className="h-8 w-8" />
              <span>Viewport</span>
            </Link>
          </div>
          <nav className="flex items-center gap-4">
            {user ? (
              <>
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  <span>{user.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 text-sm px-4 py-2 bg-transparent border-2 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-primary-500 hover:text-primary-500 rounded-lg transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/20"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
