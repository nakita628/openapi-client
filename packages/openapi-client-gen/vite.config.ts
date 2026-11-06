// `vp pack` (tsdown): the package built to dist/ as ES modules with their declarations, and the CLI.
// Lint and format settings are the workspace root's.
import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/bin.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
  },
})
