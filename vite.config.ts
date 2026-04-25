import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue'],
          pdf: ['pdf-lib', 'pdfjs-dist'],
          ocr: ['tesseract.js'],
          zip: ['jszip'],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
});
