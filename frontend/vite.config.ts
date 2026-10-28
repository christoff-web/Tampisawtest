import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Production build goes straight into the ASP.NET Core project's wwwroot.
// While developing the UI with `npm run dev`, API calls are forwarded to the running ASP.NET Core app.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    outDir: '../src/Tampisaw.Web/wwwroot',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    headers: { 'Permissions-Policy': 'camera=(self), microphone=()' },
    proxy: { '/api': { target: 'http://localhost:5080', changeOrigin: false } },
  },
})
