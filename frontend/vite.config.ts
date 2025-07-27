import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy all API requests to backend
      '^/api/.*': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Proxy direct photo access routes to backend (for image serving)
      '^/photos/.*': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // Proxy public image requests to backend  
      '^/s/.*': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    },
  },
})
