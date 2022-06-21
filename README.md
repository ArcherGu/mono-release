# Mono Release 📦

A tiny monorepo release tool. Much of the code for this tool references [Vite](https://github.com/vitejs/vite)'s [release scripts](https://github.com/vitejs/vite/tree/main/scripts).

## How it works

When you need release a package from monorepo project, you can run this tool to execute a command-line script, which you can select the package that needs to release and select a recommended version. it will automatically generate a commit message about this release, and push this commit. In addition, a tag about this version will also be pushed.

## Install

```bash
npm i mono-release -D
# Or Yarn
yarn add mono-release -D
# Or PNPM
pnpm add mono-release -D
```

## Usage

Use directly: 
```bash
npx mono-release
```
Or through a script in `package.json`:
```json
{
  "scripts": {
    "release": "mono-release"
  }
}
```

## Configuration
You can add a "mono-release" key to `package.json` to add configuration for it:
```json
{
  "mono-release": {
    "packagesPath": "packages-path", // default: packages
    "exclude": ["pkg-will-not-be-released"],
    "changelog": false // install 'conventional-changelog-cli' to generate changelog
  }
}
```
`mono-release.config.ts` (`'.js' | '.cjs' | '.mjs' | '.json'`) is also available:
```ts
import { defineConfig } from 'mono-release'

export default defineConfig({
  packagesPath: 'packages-path',
  exclude: ['pkg-will-not-be-released'],
  changelog: false
})
```

## License

MIT License © 2022 [Archer Gu](https://github.com/archergu)