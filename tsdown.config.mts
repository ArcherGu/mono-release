import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: 'cjs',
  fixedExtension: false,
  dts: true,
  deps: {
    alwaysBundle: ['strip-json-comments'],
    onlyBundle: false,
  },
})
