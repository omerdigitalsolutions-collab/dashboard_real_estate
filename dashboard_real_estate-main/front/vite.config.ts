import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions', 'firebase/storage'],
          charts: ['recharts'],
          maps: ['@react-google-maps/api'],
          grid: ['react-grid-layout', 'react-resizable'],
        },
      },
    },
  },
  server: {
    headers: {
      // Allows Firebase signInWithPopup to close the Google auth popup correctly
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    proxy: {
      '/__': {
        target: 'https://homer.management',
        changeOrigin: true,
      }
    }
  }
});

