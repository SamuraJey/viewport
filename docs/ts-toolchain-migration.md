# TypeScript toolchain migration (viewport)

This report records the migration snapshot. Subsequent page-loading changes and measurements are documented in [the frontend loading audit](frontend-performance-audit.md); those changes defer viewer CSS again and replace the initial global stylesheet approach.

## Scope and starting point

The repository contains one TypeScript package: `frontend/`. Its initial tooling was:

| Operation | Before | Status |
| --- | --- | --- |
| TS/JS lint | Oxlint 1.81, `.oxlintrc.json` | Already migrated |
| CSS lint | Stylelint 17 | Retained; Oxlint does not lint CSS |
| Formatting | Prettier 3.9.6, `.prettierrc` | Migrated to Oxfmt 0.71 |
| Typecheck | TypeScript 7.0.2, `tsc -b` | Already native TS7 |
| Production bundle | Vite 8/Rolldown + Terser | Migrated to esbuild 0.28 context API |
| Development/test | Vite 8 + Vitest 4 | Retained |

TypeScript 7's published CLI is `tsc` (the earlier native preview was called `tsgo`). No `@typescript/native-preview` dependency is needed. `tsconfig.app.json`, `tsconfig.node.json`, and `tsconfig.vitest.json` already pass under TS7, and Vitest 4 passes all current tests. The React 19, Vite 8, Vitest 4, and Node type packages currently installed needed no version changes for TS7.

## Transition plan and implementation

1. **Formatter:** Convert `.prettierrc` with `oxfmt --migrate=prettier`, then keep the same `semi`, `singleQuote`, `trailingComma`, `printWidth`, `tabWidth`, `arrowParens`, and `endOfLine` choices in `.oxfmtrc.json`. Disable automatic `package.json` sorting to avoid unrelated package metadata changes. Replace the `format` command, add `format:check`, remove Prettier, and normalize the six files where Oxfmt's output differs. There are no Prettier plugins or unsupported formatter options to replace.
2. **Lint:** Retain the existing Oxlint rules and plugins (`react`, `jsx-a11y`, `import`, `vitest`, `promise`). There is no ESLint configuration or rule set to translate. Extend the lint command to include `scripts/` and `vite.config.ts`. Keep Stylelint as the CSS linter because Oxlint covers JS/TS, not CSS. CI runs both linters and the formatting check.
3. **Typecheck:** Give the existing native TS7 `tsc -b` its own `typecheck` command and run it before production bundling. Keep project references and their build info files, so repeated checks remain incremental. CI and Docker use Node 24, matching local testing and the frontend container.
4. **Bundle:** Use `esbuild.context()` and `rebuild()` for production, with `build:watch` for incremental rebuilds. Preserve TypeScript/JSX, ESM lazy imports, content-hashed files, source maps, `VITE_*` environment values, `VITE_APP_BASE`, public assets, and gzip sidecars. Tailwind 4 runs through the already installed PostCSS and Autoprefixer packages. Move the lightbox CSS imports from the shared lazy hook into `main.tsx`: otherwise esbuild emits three identical lazy CSS bundles. The generated HTML links the single resulting CSS file. Remove the unused Vite production build configuration, Terser, and the Vite compression plugin; Vite still serves development and preview.
5. **Deployment:** The Docker build stage installs dev dependencies because the compiler, bundler, Tailwind, and formatter are build-time dependencies. The nginx runtime stage still receives only compiled assets. CI checks formatting, Oxlint, Stylelint, build, and tests.

## Measurements

Measurements were taken on the same machine, in this worktree, with output directories under `/tmp/viewport-migration-bench/`. They are single warm-cache runs, so treat the ratios as local evidence rather than a cross-machine performance guarantee. `/usr/bin/time` measured elapsed wall time and peak RSS. Both builds used `VITE_API_URL=https://backend.example.test`; baseline and new assets were written to separate temporary directories. The formatter comparison uses the same 308 source files. Lint and typecheck changed little because those tools were already Oxlint and TS7.

| Operation | Before | After | Result |
| --- | ---: | ---: | --- |
| Format check, 308 source files | Prettier 2.93 s, 447 MB RSS | Oxfmt 0.06 s, 265 MB RSS | ~49× faster locally |
| Lint | Oxlint 0.63 s, 343 MB RSS | Oxlint 0.66 s, 345 MB RSS; also checks build script/config | Comparable |
| Warm typecheck | TS7 `tsc -b` 0.93 s, 578 MB RSS | TS7 `tsc -b` 1.19 s, 564 MB RSS | Same compiler; run-to-run variation |
| Full production build, including warm typecheck | Vite/Rolldown 4.71 s, 2,676 MB RSS | esbuild 1.85 s, 626 MB RSS | ~2.5× faster locally |
| esbuild context rebuild, no source change | N/A | 0.65 s (includes HTML/gzip writes) | Incremental path verified |

The baseline output contained 33 JavaScript files (1,636,908 bytes), two CSS files (274,498 bytes), and 525,047 bytes of gzip sidecars. The corrected esbuild output contains 39 JavaScript files (1,665,749 bytes), one CSS file (257,167 bytes), and 548,154 bytes of gzip sidecars. Total gzip artifacts remain about 23 KB larger. A trial Terser pass on the esbuild JavaScript saved about 22.8 KB but added 5.6 seconds to the build. This suggests the minifier accounts for most of the size gap; different chunking also contributes. The Terser pass was not adopted.

For the landing page, browser `PerformanceResourceTiming` measured **335,937 → 331,828 encoded bytes** for `/assets/` requests and **36,195 → 33,665 encoded CSS bytes**. The old Vite output already loaded its lightbox stylesheet on the landing page; the revised esbuild output uses a single CSS file and transfers fewer initial bytes. It does make 19 asset requests versus 14 before, so network latency could still differ on slow connections. These browser measurements used local Vite preview and do not replace production network testing.

Reproduce the checks from `frontend/`:

```bash
npm ci
npm run format:check
npm run lint
npm run lint:css
npm run typecheck
npm run test:run
VITE_API_URL=https://backend.example.test npm run build
VITE_API_URL=https://backend.example.test npm run build:watch
```

Validation on this branch: `format:check`, Oxlint, Stylelint, TS7 typecheck, and production build passed; Vitest passed 97 files and 717 tests. A local Vite preview of the revised esbuild output rendered the landing page and demo dashboard without browser errors. The watch build also rebuilt after a source file timestamp change.

Sources: [Oxfmt migration guide](https://oxc.rs/docs/guide/usage/formatter/migrate-from-prettier.html), [Oxfmt CLI](https://oxc.rs/docs/guide/usage/formatter/cli), [esbuild context API](https://esbuild.github.io/api/), [TypeScript 7.0.2 native compiler README](https://github.com/microsoft/TypeScript/blob/v7.0.2/tsc/README.md).
