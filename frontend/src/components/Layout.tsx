import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useTheme } from '../hooks/useTheme'
import { ThemeSwitch } from './ThemeSwitch'
import { LogOut, User, Camera, Settings } from 'lucide-react'
import { useState } from 'react'
import { ProfileModal } from './ProfileModal'

interface LayoutProps {
  children: ReactNode
}

export const Layout = ({ children }: LayoutProps) => {
  const { user, logout } = useAuthStore()
  // Determine current theme from <html> class
  // React state for theme
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/auth/login')
  }

  const openProfile = () => setProfileOpen(true)
  const closeProfile = () => setProfileOpen(false)

  return (
    <div className={`min-h-screen text-text dark:text-accent-foreground ${theme === 'dark' ? 'bg-surface-foreground' : 'bg-surface'}`}>
      <header className={`sticky top-0 z-40 backdrop-blur-lg border-b py-3 sm:py-4 ${theme === 'dark' ? 'bg-surface-foreground/95 border-border' : 'bg-surface/95 border-border'}`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 px-3 sm:px-4">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 text-text dark:text-accent-foreground hover:opacity-80 transition-opacity font-oswald text-lg font-bold uppercase tracking-wide sm:gap-3 sm:text-xl sm:tracking-wider"
          >
            <Camera className="h-7 w-7 sm:h-8 sm:w-8" />
            <span className="truncate">Viewport</span>
          </Link>

          <nav className="ml-2 flex flex-nowrap items-center gap-2 overflow-x-auto sm:ml-4 sm:gap-3">
            <ThemeSwitch variant="inline" />
            {user ? (
              <>
                <button
                  onClick={openProfile}
                  aria-label="Account Settings"
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center bg-surface-1 dark:bg-surface-dark-1 text-text dark:text-text border border-border hover:border-accent hover:text-accent hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer transition-all duration-200"
                >
                  <Settings className="h-5 w-5" />
                </button>
                <div className="hidden sm:flex items-center gap-2 rounded-lg border border-border/40 bg-surface-1 px-3 py-2 text-text dark:border-border/60 dark:bg-surface-dark-1 dark:text-text-muted">
                  <User className="h-4 w-4" />
                  <span className="text-sm font-medium max-w-[160px] truncate">{user.display_name || user.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center text-sm bg-surface-1 dark:bg-surface-dark-1 border border-border text-text dark:text-text hover:border-danger hover:text-danger hover:bg-danger/5 dark:hover:bg-danger/10 rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 sm:w-auto sm:px-3.5 sm:gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="max-w-7xl xl:max-w-[95rem] 2xl:max-w-[120rem] mx-auto px-4 xl:px-6 2xl:px-8 py-8">
        {children}
      </main>
      <ProfileModal isOpen={isProfileOpen} onClose={closeProfile} />
    </div>
  )
}
