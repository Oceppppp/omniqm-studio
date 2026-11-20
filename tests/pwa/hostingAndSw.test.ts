import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

describe('Netlify Hosting Config & Service Worker Cache Strategy', () => {
  it('provides netlify.toml with Node >= 22, dist publish dir, no-cache HTML/SW headers, and SPA redirect', () => {
    const netlifyToml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
    expect(netlifyToml).toContain('command = "npm run build"');
    expect(netlifyToml).toContain('publish = "dist"');
    expect(netlifyToml).toContain('NODE_VERSION = "22"');
    expect(netlifyToml).toContain('for = "/sw.js"');
    expect(netlifyToml).toContain('for = "/index.html"');
    expect(netlifyToml).toContain('Cache-Control = "no-cache, no-store, must-revalidate"');
    expect(netlifyToml).toContain('from = "/*"');
    expect(netlifyToml).toContain('to = "/index.html"');
  });

  it('includes _headers and _redirects in public/ for manual Netlify Drop dist/ deploys', () => {
    const headers = fs.readFileSync(path.join(ROOT, 'public/_headers'), 'utf8');
    const redirects = fs.readFileSync(path.join(ROOT, 'public/_redirects'), 'utf8');

    expect(headers).toContain('/index.html');
    expect(headers).toContain('/sw.js');
    expect(headers).toContain('/assets/*');
    expect(headers).toContain('no-cache, no-store, must-revalidate');
    expect(redirects.trim()).toBe('/* /index.html 200');
  });

  it('parses public/sw.js cleanly with Network-First HTML, Cache-First assets, and old-cache cleanup', () => {
    const swSource = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
    expect(swSource).toContain('omniqm-__OMNIQM_BUILD_ID__');
    expect(swSource).toContain('networkFirstHtml');
    expect(swSource).toContain('cacheFirstAsset');
    expect(swSource).toContain('staleWhileRevalidate');
    expect(swSource).toContain('caches.delete(oldKey)');
    expect(swSource).toContain("if (url.pathname === '/sw.js') return;");

    const listeners: Record<string, (e: unknown) => void> = {};
    const sandbox = {
      self: {
        location: { origin: 'https://omniqm.netlify.app' },
        skipWaiting: () => undefined,
        clients: { claim: () => Promise.resolve() },
        addEventListener: (evt: string, fn: (e: unknown) => void) => {
          listeners[evt] = fn;
        },
      },
      caches: {
        open: async () => ({
          add: async () => undefined,
          put: async () => undefined,
          match: async () => undefined,
        }),
        keys: async () => [],
        delete: async () => true,
      },
      fetch: async () => new Response('ok'),
      Request,
      Response,
      URL,
    };

    vm.runInNewContext(swSource, sandbox);
    expect(typeof listeners.install).toBe('function');
    expect(typeof listeners.activate).toBe('function');
    expect(typeof listeners.fetch).toBe('function');
  });

  it('stamps all built assets into PRECACHE_PATHS via vite.config.ts and uses persistent workerPool', () => {
    const viteCfg = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
    expect(viteCfg).toContain('omniqmServiceWorkerPlugin');
    expect(viteCfg).toContain('/assets/${file}');

    const poolSrc = fs.readFileSync(path.join(ROOT, 'src/workers/workerPool.ts'), 'utf8');
    expect(poolSrc).toContain('disposeWorkerPool');
    expect(poolSrc).toContain('pendingQueue');
    expect(poolSrc).toContain('getWorkerPoolSize');
  });
});
