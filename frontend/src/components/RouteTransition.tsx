import { motion, useReducedMotion } from 'framer-motion';
import { Outlet, useLocation } from 'react-router';

const ROUTE_TRANSITION_DURATION_SECONDS = 0.18;
const PUBLIC_PROJECT_GALLERY_PATH = /^(\/share\/[^/]+)\/galleries\/[^/]+\/?$/;

export const getRouteTransitionInitial = (shouldReduceMotion: boolean | null) =>
  shouldReduceMotion ? false : { opacity: 0.72 };

export const getRouteTransitionKey = (pathname: string) => {
  const projectGalleryMatch = pathname.match(PUBLIC_PROJECT_GALLERY_PATH);
  return projectGalleryMatch ? `${projectGalleryMatch[1]}/galleries` : pathname;
};

export const RouteTransition = () => {
  const { pathname } = useLocation();
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      key={getRouteTransitionKey(pathname)}
      data-route-transition-path={pathname}
      className="min-w-0"
      initial={getRouteTransitionInitial(shouldReduceMotion)}
      animate={{ opacity: 1 }}
      transition={{
        duration: shouldReduceMotion ? 0 : ROUTE_TRANSITION_DURATION_SECONDS,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Outlet />
    </motion.div>
  );
};
