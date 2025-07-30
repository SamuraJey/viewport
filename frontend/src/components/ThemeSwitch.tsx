import { useTheme } from '../hooks/useTheme'
import { Sun, Moon } from 'lucide-react'

interface ThemeSwitchProps {
  className?: string
}

export const ThemeSwitch = ({ className = '' }: ThemeSwitchProps) => {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className={`fixed top-4 right-4 z-50 p-2 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 transition-colors shadow-lg ${className}`}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      style={{ pointerEvents: 'auto' }}
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5 text-yellow-400" />
      ) : (
        <Moon className="h-5 w-5 text-blue-600" />
      )}
    </button>
  )
}
