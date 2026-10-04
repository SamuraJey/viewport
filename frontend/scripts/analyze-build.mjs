import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const directory = path.resolve(process.argv[2] || path.join(root, 'dist'));
const { outputs } = JSON.parse(await readFile(path.join(directory, 'metafile.json'), 'utf8'));
const entry = (name) => {
  const output = Object.keys(outputs).find((file) => outputs[file].entryPoint?.endsWith(`/${name}.tsx`));
  if (!output) throw new Error(`Missing entry point ${name}`);
  return output;
};
const closure = (entries) => {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const dependency of outputs[file].imports || []) {
      if (dependency.kind === 'import-statement' && !dependency.external) visit(dependency.path);
    }
  };
  entries.forEach(visit);
  return [...seen];
};
const gzipBytes = new Map();
for (const filename of Object.keys(outputs).filter((file) => /\.(js|css)$/.test(file))) {
  const content = await readFile(path.join(directory, 'assets', path.basename(filename)));
  gzipBytes.set(filename, gzipSync(content).length);
}
const routes = ['LandingPage', 'LoginPage', 'DashboardPage', 'GalleryPage', 'PublicGalleryPage'];
const report = { directory, totalGzipBytes: [...gzipBytes.values()].reduce((sum, bytes) => sum + bytes, 0), routes: {} };
for (const route of routes) {
  const protectedRoute = ['DashboardPage', 'GalleryPage'].includes(route);
  const entries = [entry('main'), entry(route)];
  // Old builds had the owner shell directly inside App.
  if (protectedRoute && Object.values(outputs).some((output) => output.entryPoint?.endsWith('/ProtectedLayout.tsx'))) entries.push(entry('ProtectedLayout'));
  const files = closure(entries);
  const inputs = files.flatMap((filename) => Object.keys(outputs[filename].inputs));
  const forbidden = ['src/services/demoService.ts', 'src/components/ProfileModal.tsx', 'src/components/command/CommandPalette.tsx', 'src/components/upload/UploadConfirmModal.tsx', 'src/components/gallery-appearance/GalleryAppearanceSection.tsx'];
  const eagerFeatures = forbidden.filter((input) => inputs.includes(input));
  if (inputs.some((input) => input.startsWith('node_modules/yet-another-react-lightbox/'))) eagerFeatures.push('lightbox runtime');
  if (inputs.some((input) => input.startsWith('node_modules/browser-image-compression/'))) eagerFeatures.push('image compression');
  report.routes[route] = {
    jsBytes: files.reduce((sum, filename) => sum + outputs[filename].bytes, 0),
    jsGzipBytes: files.reduce((sum, filename) => sum + gzipBytes.get(filename), 0),
    jsRequests: files.length,
    eagerFeatures,
  };
  if (process.argv.includes('--check') && eagerFeatures.length) throw new Error(`${route} eagerly imports: ${eagerFeatures.join(', ')}`);
}
console.log(JSON.stringify(report, null, 2));
