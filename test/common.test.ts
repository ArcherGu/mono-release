import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config'
import { getPackageInfo, getPackages } from '../src/utils'
import { createMockMonorepo } from './mock'

const MOCK_MONOREPO_NAME = 'mock-monorepo'
let clearMockMonorepo: () => void

afterEach(() => {
  clearMockMonorepo?.()
})

describe('getPackages', async () => {
  it('should return all packages under packages folder if no mono-release config', async () => {
    clearMockMonorepo = await createMockMonorepo({
      name: MOCK_MONOREPO_NAME,
      packagesFolder: 'packages',
      packages: [
        'foo',
        {
          name: 'bar',
          startVersion: '0.0.0',
        },
      ],
    })

    const config = await resolveConfig(path.join(process.cwd(), 'test', MOCK_MONOREPO_NAME))
    const packages = await getPackages(config)

    expect(packages.includes('foo')).toBe(true)
    expect(packages.includes('bar')).toBe(true)
  })

  it('should return mono-release config packages if mono-release config exists', async () => {
    clearMockMonorepo = await createMockMonorepo({
      name: MOCK_MONOREPO_NAME,
      packagesFolder: 'packages',
      packages: [
        'foo',
        'bar',
      ],
      releaseConfig: {
        packagesPath: 'packages',
      },
    })

    const config = await resolveConfig(path.join(process.cwd(), 'test', MOCK_MONOREPO_NAME))
    const packages = await getPackages(config)

    expect(packages.includes('foo')).toBe(true)
    expect(packages.includes('bar')).toBe(true)
  })

  it('should exclude packages in mono-release config exclude', async () => {
    clearMockMonorepo = await createMockMonorepo({
      name: MOCK_MONOREPO_NAME,
      packagesFolder: 'packages',
      packages: [
        'foo',
        'bar',
      ],
      releaseConfig: {
        packagesPath: 'packages',
        exclude: ['bar'],
      },
    })

    const config = await resolveConfig(path.join(process.cwd(), 'test', MOCK_MONOREPO_NAME))
    const packages = await getPackages(config)

    expect(packages.includes('foo')).toBe(true)
    expect(packages.includes('bar')).toBe(false)
  })

  it('should throw error if mono-release config packagesPath not exists', async () => {
    clearMockMonorepo = await createMockMonorepo({
      name: MOCK_MONOREPO_NAME,
      packagesFolder: 'packages',
      packages: [
        'foo',
        'bar',
      ],
      releaseConfig: {
        packagesPath: 'packages-not-exists',
      },
    })

    try {
      const config = await resolveConfig(path.join(process.cwd(), 'test', MOCK_MONOREPO_NAME))
      await getPackages(config)
    }
    catch (error) {
      expect(error.message.includes('not found')).toBe(true)
    }
  })

  it('should throw error if no packages', async () => {
    clearMockMonorepo = await createMockMonorepo({
      name: MOCK_MONOREPO_NAME,
      packagesFolder: 'packages',
      packages: [],
    })

    try {
      const config = await resolveConfig(path.join(process.cwd(), 'test', MOCK_MONOREPO_NAME))
      await getPackages(config)
    }
    catch (error) {
      expect(error.message.includes('no packages')).toBe(true)
    }
  })
})

describe('getPackageInfo', async () => {
  it('should return correct package info', async () => {
    clearMockMonorepo = await createMockMonorepo({
      name: MOCK_MONOREPO_NAME,
      packagesFolder: 'packages',
      packages: [
        {
          name: 'bar',
          startVersion: '0.0.1',
        },
      ],
    })

    const packagesPath = path.join(process.cwd(), 'test', MOCK_MONOREPO_NAME, 'packages')

    const { currentVersion, pkgName, pkgPath, pkgDir } = getPackageInfo('bar', packagesPath)

    expect(currentVersion).toBe('0.0.1')
    expect(pkgName).toBe('bar')
    expect(pkgPath).toBe(path.join(packagesPath, 'bar', 'package.json'))
    expect(pkgDir).toBe(path.join(packagesPath, 'bar'))
  })
})
