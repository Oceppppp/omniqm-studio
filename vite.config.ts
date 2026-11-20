import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';

function omniqmServiceWorkerPlugin(): Plugin {
  let resolvedConfig: ResolvedConfig | null = null;

  return {
    name: 'omniqm-service-worker-stamp',
    apply: 'build',
    configResolved(config) {
      resolvedConfig = config;
    },
    closeBundle() {
      if (!resolvedConfig) return;
      const outDir = path.resolve(resolvedConfig.root, resolvedConfig.build.outDir);
      const swPath = path.join(outDir, 'sw.js');
      const indexPath = path.join(outDir, 'index.html');
      const assetsDir = path.join(outDir, 'assets');

      if (!fs.existsSync(swPath) || !fs.existsSync(indexPath)) return;

      const assetFiles = fs.existsSync(assetsDir)
        ? fs.readdirSync(assetsDir).filter((f) => !f.endsWith('.map')).sort()
        : [];

      const hash = createHash('sha256');
      hash.update(fs.readFileSync(indexPath));
      for (const file of assetFiles) {
        hash.update(file);
        hash.update(fs.readFileSync(path.join(assetsDir, file)));
      }
      const buildId = hash.digest('hex').slice(0, 10);

      const precacheList = [
        '/',
        '/index.html',
        '/icon.svg',
        '/manifest.webmanifest',
        ...assetFiles.map((file) => `/assets/${file}`),
      ];

      const publicSw = path.join(resolvedConfig.root, 'public', 'sw.js');
      const template = fs.existsSync(publicSw)
        ? fs.readFileSync(publicSw, 'utf8')
        : fs.readFileSync(swPath, 'utf8');

      const stamped = template
        .replace('omniqm-__OMNIQM_BUILD_ID__', `omniqm-${buildId}`)
        .replace(
          "const PRECACHE_PATHS = ['/', '/index.html', '/icon.svg', '/manifest.webmanifest'];",
          `const PRECACHE_PATHS = ${JSON.stringify(precacheList)};`,
        );

      fs.writeFileSync(swPath, stamped, 'utf8');
    },
  };
}

export default defineConfig({
  plugins: [react(), omniqmServiceWorkerPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/xlsx')) return 'vendor-xlsx';
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          if (id.includes('node_modules/react')) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
});
