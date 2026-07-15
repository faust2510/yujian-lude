import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

function appBaseRedirect() {
  const install = server => {
    server.middlewares.use((req, res, next) => {
      const requestUrl = new URL(req.url || '/', 'http://vite.local')
      if (requestUrl.pathname !== '/app') {
        next()
        return
      }
      res.statusCode = 308
      res.setHeader('Location', `/app/${requestUrl.search}`)
      res.end()
    })
  }

  return {
    name: 'meet-ruth-app-base-redirect',
    configureServer: install,
    configurePreviewServer: install,
  }
}

// 遇见路得 React 应用区 —— 挂在 /app 下，构建产物输出到 ../web-dist
export default defineConfig({
  plugins: [appBaseRedirect(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  base: '/app/',
  build: {
    outDir: '../web-dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8090',
        changeOrigin: true,
      },
    },
  },
})
