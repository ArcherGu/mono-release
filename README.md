# Mono Release 🎉
[![npm](https://img.shields.io/npm/v/mono-release?style=flat-square)](https://npm.im/mono-release) [![npm](https://img.shields.io/npm/dw/mono-release?style=flat-square)](https://npm.im/mono-release) [![GitHub Workflow Status](https://img.shields.io/github/workflow/status/ArcherGu/mono-release/CI?style=flat-square)](https://github.com/ArcherGu/mono-release/actions/workflows/ci.yml)

A tiny monorepo release tool.

## Features

- ➡️ Select a package to operate
- 🤖 Automatic version derivation
- 🔖 Semantic version by [semver](https://npm.im/semver)
- ✅ Configure via file or command line
- 🔒 Branch protection
- 🛞 Rollback protection
- 📄 Changelog by [conventional-changelog-cli](https://npm.im/conventional-changelog-cli)
- 📦 Unlimited package manager
- 📢 Also contains a [publish](https://github.com/ArcherGu/mono-release/blob/main/src/publish.ts) command

## Install

```shell
npm i mono-release -D
# Or Yarn
yarn add mono-release -D
# Or PNPM
pnpm add mono-release -D
```

**NOTE**: You may need to add `-W` flag to install it in a monorepo workspace.

## Usage

Use directly: 
```shell
npx mono-release
# Or
npx mor
```
Or through a script in `package.json`:
```json
{
  "scripts": {
    "release": "mono-release"
  }
}
```

### Publish
It also provides a command for publishing packages:
```shell
npx mono-release publish bar@0.0.1
```
The tag format must be: `<pkg>@<version>`.


## Configuration
You can add a "mono-release" key to `package.json` to add configuration for it:
```json
{
  "mono-release": {
    "packagesPath": "packages-path",
    "exclude": ["pkg-will-not-be-released"],
    "changelog": true,
    "dry": false,
    "push": true
  }
}
```
`mono-release.config.ts` (`'.js' | '.cjs' | '.mjs' | '.json'`) is also available:
```ts
import { defineConfig } from 'mono-release'

export default defineConfig({
  packagesPath: 'packages-path',
  exclude: ['pkg-will-not-be-released'],
  changelog: true,
  dry: false,
  push: true
})
```
**NOTE**: You need to install [conventional-changelog-cli](https://npm.im/conventional-changelog-cli) to generate changelog.

## CLI Options

### config

```shell
mono-release --config mono-release.config.ts
```
Use specified config file.

### specified package

```shell
mono-release --specified-package pkg-name
```
Specified package which will be released, skip selector, ignore `exclude`.

### changelog

```shell
mono-release --changelog=false
```
Whether to generate changelog.

### exclude

```shell
mono-release --exclude pkg1,pkg2,pkg3
```
Excludes specified packages (These packages will not appear in the list of options).

### dry

```shell
mono-release --dry
```
Dry run. (default: `false`)

### push

```shell
mono-release --push=false
```
Automatically push the commit and tag after release. (default: `true`)

### help

```shell
mono-release --help
```
Print help information.

### version

```shell
mono-release --version
```
Print the version.

## How it works

When you need release a package from monorepo project, you can run this tool to execute a command-line script, which you can select the package that needs to release and select a recommended version. It will automatically generate a commit message about this release, and push this commit. In addition, a tag about this version will also be pushed.

 Much of the code for this tool references [Vite](https://github.com/vitejs/vite)'s [release scripts](https://github.com/vitejs/vite/tree/main/scripts). You can observe the details of its release to understand more how it works

***NOTE**: If you have any uncommited changes, you will be prompted to commit them before you run this tool.*

## License

MIT License © 2022 [Archer Gu](https://github.com/archergu)