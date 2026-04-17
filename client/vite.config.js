import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    open: false,
  },
  preview: {
    port: 4173,
  },
  build: {
    // Split the heaviest third-party libs into their own chunks so the
    // initial JS payload stays well below the 500 kB warning threshold
    // and long-tail caches stay stable across app code changes.
    rollupOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            { name: 'router', test: /[\\/]node_modules[\\/]react-router(?:-dom)?[\\/]/, priority: 25 },
            { name: 'socket-io', test: /[\\/]node_modules[\\/](socket\.io-client|engine\.io-client|@socket\.io)[\\/]/, priority: 20 },
            { name: 'emoji-picker', test: /[\\/]node_modules[\\/]emoji-picker-react[\\/]/, priority: 20 },
            { name: 'date-fns', test: /[\\/]node_modules[\\/]date-fns[\\/]/, priority: 15 },
            { name: 'lucide', test: /[\\/]node_modules[\\/]lucide-react[\\/]/, priority: 15 },
            { name: 'axios', test: /[\\/]node_modules[\\/]axios[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
});
