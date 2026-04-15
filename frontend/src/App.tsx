import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { RequireAuth } from './components/RequireAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { AccessibilityPage } from './pages/AccessibilityPage';
import { NotFoundPage, ErrorPage } from './pages/ErrorPage';
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
const LandingPage = lazy(() =>
  import('./pages/LandingPage').then((module) => ({ default: module.LandingPage })),
);
const GalleryPage = lazy(() =>
  import('./pages/GalleryPage').then((module) => ({ default: module.GalleryPage })),
);
const ShareLinksDashboardPage = lazy(() =>
  import('./pages/ShareLinksDashboardPage').then((module) => ({
    default: module.ShareLinksDashboardPage,
  })),
);
const ShareLinkDetailPage = lazy(() =>
  import('./pages/ShareLinkDetailPage').then((module) => ({
    default: module.ShareLinkDetailPage,
  })),
);
const PublicGalleryPage = lazy(() =>
  import('./pages/PublicGalleryPage').then((module) => ({ default: module.PublicGalleryPage })),
);

export const RouteFallback = () => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Loading page"
    className="pointer-events-none fixed inset-x-0 top-0 z-100"
  >
    <div className="h-0.5 w-full bg-accent/70 animate-pulse" />
  </div>
);

const ProtectedLayout = () => (
  <RequireAuth>
    <Layout>
      <Outlet />
    </Layout>
  </RequireAuth>
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
            element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />}
          />
          <Route
            path="/auth/register"
            element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <RegisterPage />}
          />

          <Route path="/" element={<LandingPage />} />
          <Route path="/accessibility" element={<AccessibilityPage />} />

          {/* Public gallery sharing route */}
          <Route path="/share/:shareId" element={<PublicGalleryPage />} />
          <Route path="/share/:shareId/favorites/:resumeToken" element={<PublicGalleryPage />} />

          {/* Protected routes */}
          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/galleries/:id" element={<GalleryPage />} />
            <Route path="/share-links" element={<ShareLinksDashboardPage />} />
            <Route path="/share-links/:shareLinkId" element={<ShareLinkDetailPage />} />
          </Route>

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
