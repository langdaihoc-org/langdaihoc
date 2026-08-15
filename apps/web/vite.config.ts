import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

/**
 * Chèn preconnect tới origin API vào index.html lúc build.
 *
 * Web (Vercel) và API (Railway) khác origin, nên request API đầu tiên phải trả
 * trọn DNS + TCP + TLS — trên 4G thường 300–500ms trước byte dữ liệu đầu tiên.
 * Chỉ chèn khi VITE_API_URL là URL tuyệt đối hợp lệ; local dùng proxy nên bỏ qua.
 */
function preconnectApi(mode: string): Plugin {
  return {
    name: 'ldh-preconnect-api',
    transformIndexHtml(html) {
      const raw = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL?.trim();
      if (!raw) return html.replace('<!--preconnect-api-->', '');
      let origin: string;
      try {
        origin = new URL(raw).origin;
      } catch {
        return html.replace('<!--preconnect-api-->', '');
      }
      return html.replace(
        '<!--preconnect-api-->',
        `<link rel="preconnect" href="${origin}" crossorigin />\n    <link rel="dns-prefetch" href="${origin}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), preconnectApi(mode)],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@tanstack')) return 'vendor-query';
            if (id.includes('react-router')) return 'vendor-router';
            // Chỉ trang có form mới cần — trang chủ (điểm vào đông nhất) thì không.
            if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('/zod/')) {
              return 'vendor-forms';
            }
            if (id.includes('react-dom') || id.includes('/react/')) return 'vendor-react';
          }
          // Không gộp cả seller/admin vào 1 chunk — để lazyNamed theo từng page tách bundle.
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
}));
