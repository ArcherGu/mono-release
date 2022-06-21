import path from 'path'
import fs from 'fs-extra'
import type { MonoReleaseConfig } from '../../src/config'

export interface MockPkg {
  name: string
  startVersion: string
}

export interface MockMonorepoOpt {
  name: string
  packagesFolder: string
  packages: (string | MockPkg)[]
  releaseConfig?: MonoReleaseConfig
}

export async function createMockMonorepo(opt: MockMonorepoOpt) {
  const cwd = path.join(process.cwd(), 'test')
  const monorepoDir = path.join(cwd, opt.name)
  if (fs.existsSync(monorepoDir))
    throw new Error(`Monorepo dir ${monorepoDir} already exists, please remove it first`)

  const clearMockMonorepo = () => {
    if (fs.existsSync(monorepoDir))
      fs.removeSync(monorepoDir)
  }

  try {
    fs.mkdirSync(monorepoDir)

    const packageJson = {
      name: opt.name,
      version: '0.0.0',
      private: true,
    }
    if (opt.releaseConfig)
      packageJson['mono-release'] = opt.releaseConfig

    fs.writeFileSync(path.join(monorepoDir, 'package.json'), JSON.stringify(packageJson, null, 2))

    const packagesDir = path.join(monorepoDir, opt.packagesFolder)
    fs.mkdirSync(packagesDir)

    const packages = opt.packages.map((i) => {
      if (typeof i === 'string') {
        return {
          name: i,
          startVersion: '0.0.0',
        }
      }
      return i
    })

    const names = packages.map(i => i.name)
    if (names.length !== new Set(names).size)
      throw new Error('Duplicate package name')

    for (const pkg of packages) {
      const pkgDir = path.join(packagesDir, pkg.name)
      fs.mkdirSync(pkgDir)
      const pkgPath = path.join(pkgDir, 'package.json')
      const pkgJson = {
        name: pkg.name,
        version: pkg.startVersion,
      }

      fs.writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2))
    }
  }
  catch (error) {
    console.error(error)
  }

  return clearMockMonorepo
}
