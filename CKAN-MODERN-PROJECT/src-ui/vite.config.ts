import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    outDir: '../wwwroot',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
