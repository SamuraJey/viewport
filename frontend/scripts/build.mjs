import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { context, transform } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';
import { loadEnv } from 'vite';
import {
  API_URL_VALIDATION_MESSAGES,
  assertRequiredHttpsApiUrl,
} from '../src/lib/apiUrlValidation.ts';

const root = path.resolve(import.meta.dirname, '..');
const env = loadEnv('production', root, '');
assertRequiredHttpsApiUrl(env.VITE_API_URL, {
  invalidUrlMessage: API_URL_VALIDATION_MESSAGES.absoluteHttps,
});

const outdir = path.resolve(root, env.VITE_BUILD_OUT_DIR || 'dist');
const base = env.VITE_APP_BASE || '/';
const assetBase = base.endsWith('/') ? base : `${base}/`;
const watch = process.argv.includes('--watch');
const benchmark = process.argv.includes('--benchmark');

const cssPlugin = {
  name: 'tailwind-postcss',
  setup(build) {
    // Vite's ?url convention: lazy viewers load their own CSS without global links.
    build.onResolve({ filter: /\.css\?url$/ }, async (args) => {
      const resolved = await build.resolve(args.path.slice(0, -4), {
        resolveDir: args.resolveDir,
        kind: 'import-statement',
      });
      if (resolved.errors.length) return { errors: resolved.errors };
      return { path: resolved.path, namespace: 'css-url' };
    });
    build.onLoad({ filter: /.*/, namespace: 'css-url' }, async ({ path: filename }) => {
      const source = await readFile(filename, 'utf8');
      const result = await transform(source, { loader: 'css', minify: true });
      return { contents: result.code, loader: 'file', watchFiles: [filename] };
    });
    build.onLoad({ filter: /\.css$/ }, async ({ path: filename }) => {
      const source = await readFile(filename, 'utf8');
      const result = await postcss([tailwindcss(), autoprefixer()]).process(source, {
        from: filename,
        to: filename,
      });
      return { contents: result.css, loader: 'css', watchFiles: [filename] };
    });
    if (watch) build.onEnd(writeHtml);
  },
};

async function writeHtml(result) {
  if (result.errors.length || !result.metafile) return;

  if (process.argv.includes('--analyze')) {
    await writeFile(path.join(outdir, 'metafile.json'), JSON.stringify(result.metafile, null, 2));
  }

  const entry = Object.entries(result.metafile.outputs).find(([, output]) =>
    output.entryPoint?.endsWith('src/main.tsx'),
  );
  if (!entry) throw new Error('esbuild did not emit the application entry point');

  const [entryFile, entryMeta] = entry;
  const toUrl = (filename) => `${assetBase}${path.relative(outdir, path.resolve(root, filename)).replaceAll(path.sep, '/')}`;
  const cssFiles = Object.keys(result.metafile.outputs).filter((filename) => filename.endsWith('.css'));
  const cssLinks = (entryMeta.cssBundle ? [entryMeta.cssBundle] : [])
    .map((filename) => `  <link rel="stylesheet" href="${toUrl(filename)}" />`)
    .join('\n');
  const preloadFiles = new Set();
  const visit = (filename) => {
    for (const dependency of result.metafile.outputs[filename]?.imports || []) {
      if (dependency.kind !== 'import-statement' || dependency.external || preloadFiles.has(dependency.path)) continue;
      preloadFiles.add(dependency.path);
      visit(dependency.path);
    }
  };
  visit(entryFile);
  const preloads = [...preloadFiles].filter((filename) => filename.endsWith('.js'))
    .map((filename) => `  <link rel="modulepreload" href="${toUrl(filename)}" />`).join('\n');
  const manifest = { files: [], routes: {} };
  const fileIndices = new Map();
  for (const [filename, output] of Object.entries(result.metafile.outputs)) {
    if (!output.entryPoint || !filename.endsWith('.js') || filename === entryFile) continue;
    const dependencies = new Set();
    const collect = (current) => {
      if (dependencies.has(current)) return;
      dependencies.add(current);
      for (const dependency of result.metafile.outputs[current]?.imports || []) {
        if (dependency.kind === 'import-statement' && !dependency.external) collect(dependency.path);
      }
    };
    collect(filename);
    const key = path.basename(output.entryPoint).replace(/\.[^.]+$/, '');
    manifest.routes[key] = [...dependencies].filter((file) => file.endsWith('.js')).map((file) => {
      if (!fileIndices.has(file)) {
        fileIndices.set(file, manifest.files.length);
        manifest.files.push(toUrl(file));
      }
      return fileIndices.get(file);
    });
  }
  const preloadManifest = `<script type="application/json" id="viewport-module-preloads">${JSON.stringify(manifest).replaceAll('<', '\\u003c')}</script>`;
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const output = html
    .replace('src="/src/main.tsx"', `src="${toUrl(entryFile)}"`)
    .replace('</head>', `${preloads}\n${cssLinks}\n${preloadManifest}\n</head>`)
    .replace('href="/vite.svg"', `href="${assetBase}vite.svg"`);
  await writeFile(path.join(outdir, 'index.html'), output);

  if (!watch) {
    const files = Object.keys(result.metafile.outputs)
      .filter((filename) => filename.endsWith('.js') || cssFiles.includes(filename))
      .map((filename) => path.resolve(root, filename));
    await Promise.all(files.map(async (filename) => {
      const content = await readFile(filename);
      await writeFile(`${filename}.gz`, gzipSync(content));
    }));
  }
}

if (outdir === root || root.startsWith(`${outdir}${path.sep}`)) {
  throw new Error('VITE_BUILD_OUT_DIR must be a dedicated output directory');
}
const outputMarker = path.join(outdir, '.viewport-esbuild-output');
if (existsSync(outdir)) {
  if (outdir === path.join(root, 'dist') || existsSync(outputMarker)) {
    await rm(outdir, { recursive: true, force: true });
  } else if ((await readdir(outdir)).length > 0) {
    throw new Error('VITE_BUILD_OUT_DIR already contains files from another build');
  }
}
await mkdir(outdir, { recursive: true });
await writeFile(outputMarker, 'Generated by frontend/scripts/build.mjs\n');
if (existsSync(path.join(root, 'public'))) {
  await cp(path.join(root, 'public'), outdir, { recursive: true });
}

const ctx = await context({
  absWorkingDir: root,
  entryPoints: ['src/main.tsx'],
  outdir,
  publicPath: assetBase,
  entryNames: 'assets/[name]-[hash]',
  chunkNames: 'assets/[name]-[hash]',
  assetNames: 'assets/[name]-[hash]',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  tsconfig: 'tsconfig.app.json',
  sourcemap: env.VITE_BUILD_SOURCEMAP === 'true',
  minify: true,
  drop: ['console', 'debugger'],
  metafile: true,
  logLevel: 'info',
  define: {
    'import.meta.env': JSON.stringify({ ...Object.fromEntries(
      Object.entries(env).filter(([key]) => key.startsWith('VITE_')),
    ), MODE: 'production', BASE_URL: base, PROD: true, DEV: false, SSR: false }),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0'),
  },
  plugins: [cssPlugin],
});

try {
  const start = performance.now();
  const result = await ctx.rebuild();
  if (!watch) await writeHtml(result);
  console.log(`esbuild initial: ${(performance.now() - start).toFixed(1)} ms`);

  if (benchmark) {
    const rebuildStart = performance.now();
    const rebuilt = await ctx.rebuild();
    await writeHtml(rebuilt);
    console.log(`esbuild unchanged rebuild: ${(performance.now() - rebuildStart).toFixed(1)} ms`);
  }
  if (watch) {
    await ctx.watch();
    console.log('Watching for changes...');
    await new Promise(() => {});
  }
} finally {
  await ctx.dispose();
}
