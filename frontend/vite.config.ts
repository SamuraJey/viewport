/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import type { ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const base = env.VITE_APP_BASE ?? '/';
  const devPort = toNumber(env.VITE_DEV_SERVER_PORT, 5173);
  const previewPort = toNumber(env.VITE_PREVIEW_PORT, 4173);
  const backendUrl = env.VITE_DEV_SERVER_TARGET ?? env.VITE_API_URL ?? 'http://localhost:8000';
  const apiPrefixInput = env.VITE_DEV_API_PREFIX ?? '/api';
  const apiPrefix = apiPrefixInput.startsWith('/') ? apiPrefixInput : `/${apiPrefixInput}`;
  const enableProxy = env.VITE_DEV_PROXY !== 'false';

  const escapedPrefix = escapeRegex(apiPrefix);
  const apiProxyKey = `^${escapedPrefix}/.*`;
  const apiRewritePattern = new RegExp(`^${escapedPrefix}`);

  const proxyConfig: Record<string, ProxyOptions> | undefined = enableProxy
    ? {
        [apiProxyKey]: {
          target: backendUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(apiRewritePattern, ''),
        },
        '^/photos/.*': {
          target: backendUrl,
          changeOrigin: true,
        },
        '^/s/.*': {
          target: backendUrl,
          changeOrigin: true,
        },
      }
    : undefined;

  return {
    base,
    plugins: [react(), tailwindcss()],
    server: {
      port: devPort,
      ...(proxyConfig ? { proxy: proxyConfig } : {}),
    },
    preview: {
      port: previewPort,
    },
    build: {
      outDir: env.VITE_BUILD_OUT_DIR ?? 'dist',
      sourcemap: env.VITE_BUILD_SOURCEMAP === 'true',
    },
    define: {
      __APP_VERSION__: JSON.stringify(env.npm_package_version ?? '0.0.0'),
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/setupTests.ts',
      css: true,
    },
  };
});
