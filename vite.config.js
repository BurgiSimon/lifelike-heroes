import { defineConfig } from 'vite';

// Hero code names its public files as '/assets/<hero>/…'. On GitHub Pages the site lives under /<repo>/, so a build
// with a base prefixes those literals with it. Dev (base '/') is untouched.
const assetBase = () => {
  let base = '/';
  return {
    name: 'asset-base',
    apply: 'build',
    configResolved(config) { base = config.base; },
    transform(code, id) {
      if (base === '/' || !id.includes('/src/')) return null;
      return code.replace(/(['"`])\/assets\//g, `$1${base}assets/`);
    },
  };
};

// One page per hero; index.html is the gallery.
export default defineConfig({
  plugins: [assetBase()],
  server: { host: true, port: 5173, strictPort: true },
  build: { rollupOptions: { input: ['index.html', 'meadow.html', 'koi.html', 'stars.html', 'rain.html', 'mist.html'] } },
});
