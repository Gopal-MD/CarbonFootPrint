import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Vite configuration for the Carbon Footprint Awareness Platform frontend.
 * Optimized for production performance with code splitting, terser minification,
 * and Vitest integration for unit/integration tests.
 *
 * @see https://vitejs.dev/config/
 */
export default defineConfig({
  plugins: [
    react({
      // Enable Fast Refresh for optimal DX
      fastRefresh: true,
    }),
  ],

  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@components': resolve(__dirname, './src/components'),
      '@pages': resolve(__dirname, './src/pages'),
      '@hooks': resolve(__dirname, './src/hooks'),
      '@utils': resolve(__dirname, './src/utils'),
      '@services': resolve(__dirname, './src/services'),
      '@context': resolve(__dirname, './src/context'),
    },
  },

  // ── Production Build Configuration ──────────────────────────────────────
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: false, // Disabled in production for security
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
      },
    },
    cssCodeSplit: true,
    assetsInlineLimit: 4096, // Inline assets < 4KB as base64

    rollupOptions: {
      output: {
        // Strategic chunk splitting for optimal cache behavior
        manualChunks(id) {
          // Core React runtime — cached aggressively
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'vendor-react';
          }
          // Firebase SDK — large, rarely changes
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'vendor-firebase';
          }
          // Google Maps — lazy loaded on commute page
          if (id.includes('node_modules/@googlemaps')) {
            return 'vendor-maps';
          }
          return undefined;
        },
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
    },
  },

  // ── Dev Server Configuration ─────────────────────────────────────────────
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Proxy API calls to the Express backend in development
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // ── Vitest Configuration ─────────────────────────────────────────────────
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // NOTE: Thresholds raised to 80%+ in Step 4 once component tests added
      thresholds: {
        lines: 10,
        functions: 20,
        branches: 60,
        statements: 10,
      },
      exclude: [
        'node_modules/',
        'src/test/',
        'src/main.tsx',
        '**/*.config.*',
        '**/types/**',
        'playwright/**',
        'dist/**',
      ],
    },
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['node_modules', 'dist', 'playwright'],
  },
});
