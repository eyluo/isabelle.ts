import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Reset call history between tests; undo vi.stubGlobal (fetch) after each.
    clearMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Entry points that only wire things together and talk to Discord;
      // covered by the manual checklist rather than automated tests.
      exclude: ['src/index.ts', 'src/deploy-commands.ts', 'src/types.ts'],
      reporter: ['text', 'html'],
    },
  },
});
