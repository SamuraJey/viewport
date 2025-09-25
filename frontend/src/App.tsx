import { Routes, Route, Navigate } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { DashboardPage } from './pages/DashboardPage'
import { GalleryPage } from './pages/GalleryPage'
import { PublicGalleryPage } from './pages/PublicGalleryPage'
import { NotFoundPage, ErrorPage } from './pages/ErrorPage'
import { useAuthStore } from './stores/authStore'

function App() {
  const { isAuthenticated } = useAuthStore()

  return (
    <ErrorBoundary>
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

        {/* Public gallery sharing route */}
        <Route
          path="/share/:shareId"
          element={<PublicGalleryPage />}
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

        {/* Error routes */}
        <Route path="/error/404" element={<NotFoundPage />} />
        <Route path="/error/403" element={<ErrorPage statusCode={403} />} />
        <Route path="/error/500" element={<ErrorPage statusCode={500} />} />
        <Route path="/error/503" element={<ErrorPage statusCode={503} />} />

        {/* Fallback route - 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default App
