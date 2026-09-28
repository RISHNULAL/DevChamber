import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], envDir: '..', optimizeDeps: { noDiscovery: true, include: [] }, server: { port: 5173 } });
