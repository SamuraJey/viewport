import { Routes, Route, Navigate } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { DashboardPage } from './pages/DashboardPage'
import { useAuthStore } from './stores/authStore'
import { GalleryPage } from './pages/GalleryPage'

function App() {
  const { isAuthenticated } = useAuthStore()

  return (
    <Routes>
        {/* Public routes */}
        <Route 
          path="/auth/login" 
          element={
            isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
          } 
        />
        <Route 
          path="/auth/register" 
          element={
            isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />
          } 
        />
        
        {/* Protected routes */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/galleries/:id"
          element={
            <RequireAuth>
              <GalleryPage />
            </RequireAuth>
          }
        />
        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
  )
}

export default App
