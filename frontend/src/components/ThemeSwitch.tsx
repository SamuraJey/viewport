import { useTheme } from '../hooks/useTheme'
import { Sun, Moon } from 'lucide-react'
import { useState } from 'react'

interface ThemeSwitchProps {
  className?: string
}

export const ThemeSwitch = ({ className = '' }: ThemeSwitchProps) => {
  const { theme, toggleTheme } = useTheme()
  const [isAnimating, setIsAnimating] = useState(false)

  const handleToggle = () => {
    setIsAnimating(true)
    toggleTheme()
    setTimeout(() => setIsAnimating(false), 400) // Синхронизировано с длительностью анимации темы
  }

  return (
    <button
      onClick={handleToggle}
      className={`fixed top-4 right-4 z-50 p-2 rounded-lg bg-surface dark:bg-surface border border-border dark:border-border transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-110 ${className}`}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      style={{ pointerEvents: 'auto' }}
    >
      <div className={`${isAnimating ? 'animate-spin-once' : ''}`}>
        {theme === 'dark' ? (
          <Sun className="h-5 w-5 text-yellow-400" />
        ) : (
          <Moon className="h-5 w-5 text-yellow-400" />
        )}
      </div>
    </button>
  )
}
