import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // 0xio SDK depends on Node.js globals (Buffer, process, crypto, stream)
    // — required for browser bundling.
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'stream', 'events', 'crypto'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
})
