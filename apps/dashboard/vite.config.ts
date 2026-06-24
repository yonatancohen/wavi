import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

function isLocalViteApiUrl(url: string | undefined): boolean {
  if (!url?.trim()) return true;
  if (url === '/api') return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url);
}

function assertViteApiUrlForVercelBuild() {
  if (!process.env.VERCEL) return;

  const url = process.env.VITE_API_URL?.trim();
  if (!url || isLocalViteApiUrl(url)) {
    throw new Error('VITE_API_URL must be set to your Railway API URL (…/api) for Vercel Preview and Production builds. Run: bun run sync-secrets');
  }
}

assertViteApiUrlForVercelBuild();

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@docs': resolve(__dirname, '../../docs'),
      '@wavi/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['connection'] = 'keep-alive';
            }
          });
        },
      },
    },
  },
});
