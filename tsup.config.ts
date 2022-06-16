import { defineConfig } from 'tsup'

export default defineConfig({
  name: 'mono-release',
  entry: ['src/index.ts', 'src/release.ts', 'src/publish.ts'],
  clean: ['dist'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: true,
  noExternal: ['execa'],
})
