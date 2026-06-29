import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 遇见路得 React 应用区 —— 挂在 /app 下，构建产物输出到 ../web-dist
export default defineConfig({
  plugins: [react()],
  base: '/yujian/',
  build: {
    outDir: '../web-dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/yujian/api': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/yujian/, ''),
      },
    },
  },
})
