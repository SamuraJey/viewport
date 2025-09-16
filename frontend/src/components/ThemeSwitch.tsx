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
      className={`fixed top-4 right-4 z-50 p-2 rounded-lg bg-surface dark:bg-surface border border-border dark:border-border transition-colors shadow-lg ${className}`}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      style={{ pointerEvents: 'auto' }}
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5 text-accent" />
      ) : (
        <Moon className="h-5 w-5 text-accent" />
      )}
    </button>
  )
}
