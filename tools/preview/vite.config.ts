import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      '@devvit/web/client': fileURLToPath(new URL('./devvit-stub.ts', import.meta.url)),
    },
  },
  build: {
    outDir: '/tmp/preview-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        game: fileURLToPath(new URL('./game.html', import.meta.url)),
        battle: fileURLToPath(new URL('./battle.html', import.meta.url)),
        stress: fileURLToPath(new URL('./stress.html', import.meta.url)),
      },
    },
  },
});
