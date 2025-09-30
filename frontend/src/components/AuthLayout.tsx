
import type { ReactNode } from 'react'
import { ThemeSwitch } from './ThemeSwitch'
import { useTheme } from '../hooks/useTheme'

// No React state needed; direct DOM toggling
// Removed unused imports for React hooks and lucide icons

interface AuthLayoutProps {
  children: ReactNode
}

export const AuthLayout = ({ children }: AuthLayoutProps) => {
  const { theme } = useTheme()

  return (
    <div
      className={`auth-layout min-h-screen bg-gradient-to-br ${theme === 'dark' ? 'from-surface-foreground/95 to-surface-foreground/80' : 'from-surface to-surface-1'} flex items-center justify-center p-4`}
    >
      {/* Shared ThemeToggle */}
      <ThemeSwitch />

      {children}
    </div>
  )
}
