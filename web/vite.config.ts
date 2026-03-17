import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

function normalizeBasePath(basePath: string): string {
  if (!basePath || basePath === '/') return '/';
  const withLeadingSlash = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function buildPublicUrl(siteUrl: string, basePath: string, assetPath = ''): string {
  // For dev and local preview, we prefer root-relative paths to avoid SPA fallback issues
  // for static assets when navigating directly.
  if (siteUrl.includes('localhost')) {
    return `${basePath}${assetPath}`;
  }
  const relativePath = `${basePath === '/' ? '' : basePath.slice(1)}${assetPath}`;
  return new URL(relativePath, `${siteUrl}/`).toString();
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const basePath = normalizeBasePath(env.VITE_BASE_PATH ?? '/');
  const siteUrl = (env.VITE_SITE_URL ?? 'http://localhost:5173').replace(/\/+$/, '');

  return {
    base: basePath,
    plugins: [
      react(),
      {
        name: 'html-meta-replacements',
        transformIndexHtml(html) {
          return html
            .replaceAll('__SITE_URL__', buildPublicUrl(siteUrl, basePath))
            .replaceAll('__OG_IMAGE_URL__', buildPublicUrl(siteUrl, basePath, 'og-default.png'))
            .replaceAll('__FAVICON_URL__', buildPublicUrl(siteUrl, basePath, 'favicon-32x32.png'));
        },
      },
    ],
    resolve: {
      alias: {
        '@rpg-loom/engine': path.resolve(__dirname, '../packages/engine/src/engine.ts'),
        '@rpg-loom/shared': path.resolve(__dirname, '../packages/shared/src/index.ts'),
        '@rpg-loom/content': path.resolve(__dirname, '../packages/content/dist/index.js'),
        '@rpg-loom/sdk': path.resolve(__dirname, '../sdk/src/index.ts'),
      },
    },
    optimizeDeps: {
      exclude: ['@rpg-loom/engine', '@rpg-loom/shared', '@rpg-loom/content', '@rpg-loom/sdk']
    },
    server: {
      port: 5173
    }
  };
});
