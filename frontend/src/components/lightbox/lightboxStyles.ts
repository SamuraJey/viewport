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

export const loadLightboxStyles = () =>
  Promise.all([loadStylesheet(mainStyles), loadStylesheet(thumbnailStyles)]);
