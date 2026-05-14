import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4433',
        changeOrigin: true,
      },
    },
  },

  build: {
    // Rolldown optimizations
    target: 'es2022',
    cssMinify: 'lightningcss', // Better CSS minification (now built-in)
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor'
            }
            if (id.includes('react-router-dom')) {
              return 'router'
            }
          }
        },
      },
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
})
