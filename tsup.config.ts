import { defineConfig } from 'tsup'

export default defineConfig({
  name: 'mono-release',
  entry: ['src/index.ts', 'src/cli.ts'],
  dts: {
    resolve: true,
    entry: 'src/index.ts',
  },
  clean: true,
  splitting: true,
  noExternal: ['strip-json-comments'],
})
