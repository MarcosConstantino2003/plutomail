import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api-mailtm': {
        target: 'https://api.mail.tm',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api-mailtm/, ''),
      },
      '/api-mailgw': {
        target: 'https://api.mail.gw',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api-mailgw/, ''),
      },
      '/api-dropmail': {
        target: 'https://dropmail.me',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api-dropmail/, ''),
      },
    },
  },
})
