import { preloadRoute } from '../lib/preloadRoute';
/** Keep the demo dataset and persistence code out of normal API consumers. */
export const loadDemoService = async () => {
  const { getDemoService } = await preloadRoute('demoService', () => import('./demoService'));
  return getDemoService();
};
