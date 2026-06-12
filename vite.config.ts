import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    // 把 Cesium 静态资源复制到 dev/build 产物，使 /Cesium/* 路径可访问
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/cesium/Build/Cesium/Cesium.js',
          dest: 'Cesium',
        },
        {
          src: 'node_modules/cesium/Build/Cesium/Workers/*',
          dest: 'Cesium/Workers',
        },
        {
          src: 'node_modules/cesium/Build/Cesium/ThirdParty/*',
          dest: 'Cesium/ThirdParty',
        },
        {
          src: 'node_modules/cesium/Build/Cesium/Assets/*',
          dest: 'Cesium/Assets',
        },
        {
          src: 'node_modules/cesium/Build/Cesium/Widgets/*',
          dest: 'Cesium/Widgets',
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  define: {
    // Cesium 运行时以此为根路径加载 Worker、CSS 等
    // 如 Worker 路径: CESIUM_BASE_URL + 'Workers/...'
    CESIUM_BASE_URL: JSON.stringify('/Cesium/'),
  },
})
