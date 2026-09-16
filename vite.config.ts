import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/antd/')) return 'antd-vendor';
          if (id.includes('/rc-')) return 'antd-components';
          if (id.includes('/@ant-design/')) return 'antd-runtime';
          if (id.includes('/recharts/') || id.includes('/d3-')) return 'charts-vendor';
          if (id.includes('/firebase/')) return 'firebase-vendor';
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'react-vendor';
        },
      },
    },
  },
});
