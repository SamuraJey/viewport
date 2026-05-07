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
const ProjectPage = lazy(() =>
  import('./pages/ProjectPage').then((module) => ({ default: module.ProjectPage })),
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
    className="pointer-events-none fixed inset-0 z-100 flex items-start justify-center bg-surface/35 backdrop-blur-[2px] dark:bg-surface-dark/35"
  >
    <div className="absolute inset-x-0 top-0 h-1 w-full overflow-hidden bg-accent/10">
      <div className="h-full w-1/2 animate-pulse rounded-r-full bg-accent/80" />
    </div>
    <div className="mt-24 inline-flex items-center gap-3 rounded-2xl border border-border/60 bg-surface/95 px-4 py-3 text-sm font-semibold text-text shadow-xl backdrop-blur-lg dark:border-border/40 dark:bg-surface-dark/95">
      <span className="h-3 w-3 animate-pulse rounded-full bg-accent" aria-hidden="true" />
      Preparing your workspace…
    </div>
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
          <Route path="/share/:shareId/galleries/:galleryId" element={<PublicGalleryPage />} />
          <Route path="/share/:shareId/favorites/:resumeToken" element={<PublicGalleryPage />} />

          {/* Protected routes */}
          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/projects/:projectId/galleries/:galleryId" element={<GalleryPage />} />
            <Route path="/galleries/:id" element={<GalleryPage />} />
            <Route path="/projects/:id" element={<ProjectPage />} />
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
