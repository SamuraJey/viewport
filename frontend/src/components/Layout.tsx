import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { LogOut, User, Camera } from 'lucide-react'

interface LayoutProps {
  children: ReactNode
}

export const Layout = ({ children }: LayoutProps) => {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/auth/login')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1e1e1e', color: '#fff' }}>
      <header className="modern-nav">
        <div className="nav-container">
          <div className="flex items-center">
            <Link to="/" className="nav-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Camera style={{ height: '2rem', width: '2rem', color: '#fff' }} />
              <span>Viewport</span>
            </Link>
          </div>
          
          <nav className="nav-links">
            {user && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#d1d5db' }}>
                  <User style={{ height: '1.25rem', width: '1.25rem' }} />
                  <span>{user.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="modern-btn modern-btn--secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                >
                  <LogOut style={{ height: '1.25rem', width: '1.25rem' }} />
                  <span>Sign Out</span>
                </button>
              </>
            )}
          </nav>
        </div>
      </header>
      
      <main className="modern-container">
        {children}
      </main>
    </div>
  )
}
