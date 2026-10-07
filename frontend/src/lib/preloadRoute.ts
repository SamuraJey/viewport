// Keep relative hints anchored to the entry document after SPA navigation.
const entryDocumentUrl = typeof document === 'undefined' ? undefined : document.baseURI;

/** Discover the selected module's static dependencies together, without fetching other routes. */
export const preloadRoute = <T>(key: string, load: () => Promise<T>): Promise<T> => {
  try {
    const element = document.getElementById('viewport-module-preloads');
    if (element?.textContent) {
      const manifest = JSON.parse(element.textContent) as {
        files: string[];
        routes: Record<string, number[]>;
      };
      const existing = new Set(
        [...document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')].map(
          (link) => link.href,
        ),
      );
      for (const index of manifest.routes[key] ?? []) {
        const href = manifest.files[index];
        if (!href) continue;
        const absolute = new URL(href, entryDocumentUrl ?? document.baseURI).href;
        if (existing.has(absolute)) continue;
        const link = document.createElement('link');
        link.rel = 'modulepreload';
        link.href = absolute;
        document.head.append(link);
        existing.add(absolute);
      }
    }
  } catch {
    // Missing/invalid preload hints must never prevent normal imports (including Vite dev).
  }
  return load();
};
