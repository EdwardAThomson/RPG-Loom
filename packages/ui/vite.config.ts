import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@rpg-loom/engine': path.resolve(__dirname, '../engine/src/engine.ts'),
      '@rpg-loom/shared': path.resolve(__dirname, '../shared/src/index.ts'),
      '@rpg-loom/content': path.resolve(__dirname, '../content/dist/index.js'),
    },
  },
})
