import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
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
});
