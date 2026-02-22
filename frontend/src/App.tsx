import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth } from './components/RequireAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotFoundPage, ErrorPage } from './pages/ErrorPage';
import { PublicGalleryPage } from './pages/PublicGalleryPage';
import { useAuthStore } from './stores/authStore';

const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('./pages/RegisterPage').then((module) => ({ default: module.RegisterPage })),
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
);
const GalleryPage = lazy(() =>
  import('./pages/GalleryPage').then((module) => ({ default: module.GalleryPage })),
);

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-surface text-muted">
    <div className="text-sm font-medium">Loading page...</div>
  </div>
);

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public routes */}
          <Route
            path="/auth/login"
            element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
          />
          <Route
            path="/auth/register"
            element={isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />}
          />

          {/* Public gallery sharing route */}
          <Route path="/share/:shareId" element={<PublicGalleryPage />} />

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
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
