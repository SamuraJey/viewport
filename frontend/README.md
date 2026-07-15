# React + TypeScript + Vite

## Environment configuration

The Vite build now picks up settings from `.env` files or runtime environment variables. The defaults live in `.env`, but you can override them per deployment:

- `VITE_API_URL` – backend origin used by the application code.
- `VITE_APP_BASE` – base path when serving the bundle (defaults to `/`).
- `VITE_DEV_SERVER_TARGET` – dev proxy target; falls back to `VITE_API_URL`.
- `VITE_DEV_API_PREFIX` – prefix to strip when proxying API calls (defaults to `/api`).
- `VITE_DEV_SERVER_PORT` / `VITE_PREVIEW_PORT` – ports used for `npm run dev` and `npm run preview`.
- `VITE_BUILD_OUT_DIR` – build output directory (`dist` by default).
- `VITE_BUILD_SOURCEMAP` – set to `true` to emit production sourcemaps.

Create `.env.local`, `.env.production`, etc. to customize these per environment. Vite exposes any `VITE_*` variable as `import.meta.env` inside the React app.

This template provides a minimal setup to get React working in Vite with HMR and [oxlint](https://oxc.rs/docs/guide/usage/linter) for linting.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Linting with oxlint

The frontend uses [oxlint](https://oxc.rs/) as its linter, configured via [`.oxlintrc.json`](./.oxlintrc.json) at the project root. Run `npm run lint` to lint, `npm run lint:fix` to apply auto-fixes, and the `qa` script chains lint, tests, and a production build together. The project is also on [TypeScript 7](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), which uses the native Go-based `tsc` compiler.
