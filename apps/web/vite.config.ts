import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['terminal.local'],
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/v1/documents': { target: 'http://127.0.0.1:3002' },
      '/api/v1/notifications': { target: 'http://127.0.0.1:3003' },
      '/api': { target: 'http://127.0.0.1:3001' },
      '/socket.io': { target: 'http://127.0.0.1:3003', ws: true },
      '/docs': { target: 'http://127.0.0.1:3001' },
    },
  },
  build: { sourcemap: false },
});
