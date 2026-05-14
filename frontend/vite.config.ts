import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.LPSEX_API_PROXY_TARGET ?? 'http://127.0.0.1:8888';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': apiProxyTarget,
    },
  },
  preview: {
    allowedHosts: true,
    proxy: {
      '/api': apiProxyTarget,
    },
  },
  test: {
    environment: 'jsdom',
    testTimeout: 20000,
  },
});
