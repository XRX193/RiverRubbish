import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.LLM_PROXY_PORT || 8787}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    // 基于配置文件自身解析，保证任何工作目录下都能定位 tests/setup.js
    setupFiles: [fileURLToPath(new URL('./tests/setup.js', import.meta.url))],
  },
});
