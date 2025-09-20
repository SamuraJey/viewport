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
      {/* Fixed theme toggle button for all pages */}
      <ThemeSwitch />

      <header className={`sticky top-0 z-40 backdrop-blur-lg border-b py-4 ${theme === 'dark' ? 'bg-surface-foreground/95 border-border' : 'bg-surface/95 border-border'}`}>
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center">
            <Link
              to="/"
              className="flex items-center gap-3 text-text dark:text-accent-foreground hover:opacity-80 transition-opacity font-oswald text-xl font-bold uppercase tracking-wider"
            >
              <Camera className="h-8 w-8" />
              <span>Viewport</span>
            </Link>
          </div>
          <nav className="flex items-center gap-4">
            {user ? (
              <>
                <div className="flex items-center gap-2 text-text-muted">
                  <User className="h-5 w-5" />
                  <span>{user.display_name || user.email}</span>
                </div>
                <button
                  onClick={openProfile}
                  aria-label="Account Settings"
                  className="flex items-center justify-center p-2 text-text-muted dark:text-text border border-border dark:border-border hover:border-accent hover:text-accent hover:bg-surface/50 dark:hover:bg-surface-foreground/50 hover:-translate-y-0.5 hover:shadow-lg rounded-lg cursor-pointer"
                >
                  <Settings className="h-5 w-5" />
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 text-sm px-4 py-2 bg-transparent border-2 border-border dark:border-border text-text-muted dark:text-text hover:border-accent hover:text-accent rounded-lg hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/20"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Sign Out</span>
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
