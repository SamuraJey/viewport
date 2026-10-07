import mainStyles from 'yet-another-react-lightbox/styles.css?url';
import thumbnailStyles from 'yet-another-react-lightbox/plugins/thumbnails.css?url';

const pending = new Map<string, Promise<void>>();

export const loadStylesheet = (href: string): Promise<void> => {
  const existing = pending.get(href);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => {
      pending.delete(href);
      link.remove();
      reject(new Error('Could not load photo viewer styles'));
    };
    document.head.append(link);
  });
  pending.set(href, promise);
  return promise;
};

// With a relative base, esbuild emits file-loader URLs relative to the importing chunk.
const stylesheetUrl = (href: string) =>
  href.startsWith('.') ? new URL(href, import.meta.url).href : href;

export const loadLightboxStyles = () =>
  Promise.all([
    loadStylesheet(stylesheetUrl(mainStyles)),
    loadStylesheet(stylesheetUrl(thumbnailStyles)),
  ]);
