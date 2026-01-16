import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      port: parseInt(env.VITE_PORT || '5174'),
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:30001',
          changeOrigin: true,
        },
      },
    },
  }
})
