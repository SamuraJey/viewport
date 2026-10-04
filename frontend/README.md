# Viewport frontend

## Environment configuration

Vite serves the development app and Vitest runs tests. Production assets are built with incremental esbuild. Both read `.env` files and runtime environment variables:

- `VITE_API_URL` – backend origin used by the application code.
- `VITE_APP_BASE` – base path when serving the bundle (defaults to `/`).
- `VITE_DEV_SERVER_TARGET` – dev proxy target; falls back to `VITE_API_URL`.
- `VITE_DEV_API_PREFIX` – prefix to strip when proxying API calls (defaults to `/api`).
- `VITE_DEV_SERVER_PORT` / `VITE_PREVIEW_PORT` – ports used for `npm run dev` and `npm run preview`.
- `VITE_BUILD_OUT_DIR` – build output directory (`dist` by default).
- `VITE_BUILD_SOURCEMAP` – set to `true` to emit production sourcemaps.

Create `.env.local`, `.env.production`, etc. to customize these per environment. The build exposes `VITE_*` variables as `import.meta.env` inside the React app.

## Commands

- `npm run format` / `npm run format:check`: Oxfmt
- `npm run lint` / `npm run lint:fix`: Oxlint for TypeScript and JavaScript
- `npm run lint:css`: Stylelint for CSS
- `npm run typecheck`: TypeScript 7 native compiler (`tsc -b`; the published TS7 binary is named `tsc`)
- `npm run build`: typecheck and production esbuild bundle
- `npm run build:watch`: incremental esbuild watch build
- `npm run dev` / `npm run preview`: Vite development and preview servers
- `npm run qa`: formatting, lint, tests, and production build

See [the migration record](../docs/ts-toolchain-migration.md) for the dependency audit, benchmark method, and results.

## Page loading audit

See [frontend performance audit](../docs/frontend-performance-audit.md) for lazy feature loading and before/after measurements. To inspect initial route graphs:

```sh
VITE_API_URL=https://backend.example.test node scripts/build.mjs --analyze
node scripts/analyze-build.mjs dist --check
```

The check rejects eager imports of optional demo/viewer/upload/profile features in the measured route graphs. Production builds omit the analysis metafile unless `--analyze` is passed.
