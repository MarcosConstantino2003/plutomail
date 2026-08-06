import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api-dropmail': {
        target: 'https://dropmail.me',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api-dropmail/, ''),
      },
    },
  },
})
