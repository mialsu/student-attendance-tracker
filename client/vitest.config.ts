import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    /**
     * Vitest's default glob claims `**\/*.spec.ts`, which is Playwright's convention too — so
     * `e2e/auth.spec.ts` was collected by both runners, and vitest failed the file with
     * "Playwright Test did not expect test.describe() to be called here". Two runners over one
     * file is the same defect as two implementations of one behaviour: name the owner. Playwright
     * owns `e2e/` (its `testDir`), vitest owns `src/`.
     */
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts',
        'dist/',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
