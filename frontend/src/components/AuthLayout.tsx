
import type { ReactNode } from 'react'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

// No React state needed; direct DOM toggling
// Removed unused imports for React hooks and lucide icons

interface AuthLayoutProps {
  children: ReactNode
}

export const AuthLayout = ({ children }: AuthLayoutProps) => {
  const { theme, toggleTheme } = useTheme()

  return (
    <div
      className={`auth-layout min-h-screen bg-gradient-to-br ${theme === 'dark' ? 'from-gray-900 to-gray-800' : 'from-gray-100 to-gray-200'
        } flex items-center justify-center p-4`}
    >
      {/* Theme Toggle - positioned at top right */}
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 z-50 p-2 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 transition-colors shadow-lg"
        aria-label="Toggle dark mode"
      >
        {theme === 'dark' ? (
          <Sun className="h-5 w-5 text-yellow-400" />
        ) : (
          <Moon className="h-5 w-5 text-gray-700" />
        )}
      </button>

      {children}
    </div>
  )
}
