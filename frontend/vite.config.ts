/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'
import path from 'path'

/**
 * Vite 插件：在 index.html 中注入高德地图 JS API 脚本
 * 高德 JS API 2.0 要求安全密钥(_AMapSecurityConfig)在 JS API 脚本之前设置
 * 此插件将环境变量注入到 HTML 中，确保加载顺序正确
 */
function amapHtmlPlugin(): Plugin {
  let amapKey = ''
  let amapSecurity = ''

  return {
    name: 'amap-html-inject',
    configResolved(config) {
      // Vite 会将 .env 中的 VITE_ 变量加载到 config.env
      amapKey = config.env.VITE_AMAP_KEY || ''
      amapSecurity = config.env.VITE_AMAP_SECURITY_CODE || ''
    },
    transformIndexHtml(html) {
      if (!amapKey) return html

      // 在 leaflet.css </link> 之后插入高德脚本
      // 找到 </head> 标签，在其前面插入
      const headCloseIdx = html.indexOf('</head>')
      if (headCloseIdx === -1) return html

      const amapScripts = `
    <!-- 高德 JS API 2.0：安全密钥必须在 JS API 脚本加载之前设置 -->
    <script type="text/javascript">
      window._AMapSecurityConfig = {
        securityJsCode: '${amapSecurity}',
      };
    </script>
    <script
      type="text/javascript"
      src="https://webapi.amap.com/maps?v=2.0&key=${amapKey}"
    ></script>
`

      return html.slice(0, headCloseIdx) + amapScripts + html.slice(headCloseIdx)
    },
  }
}

export default defineConfig({
  plugins: [amapHtmlPlugin(), react(), cesium()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'echarts-core': ['echarts/core', 'echarts/renderers', 'echarts/components'],
          'echarts-charts': ['echarts/charts'],
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'leaflet-vendor': ['leaflet', 'react-leaflet'],
          'markdown-vendor': ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/**/*.d.ts',
        'src/test/**',
        'src/types/**',
        'src/vite-env.d.ts',
      ],
    },
  },
})
