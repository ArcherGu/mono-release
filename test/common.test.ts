import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getPackageInfo, getPackages } from '../src/utils'
import { createMockMonorepo } from './mock'

const MOCK_MONOREPO_NAME = 'mock-monorepo'
let clearMockMonorepo: () => void

afterEach(() => {
  clearMockMonorepo?.()
})

describe('getPackages', async () => {
  const packagesPath = path.join(process.cwd(), 'test', MOCK_MONOREPO_NAME, 'packages')

  it('should return all packages under packages folder', async () => {
    clearMockMonorepo = await createMockMonorepo({
      name: MOCK_MONOREPO_NAME,
      packagesFolder: 'packages',
      packages: [
        'foo',
        'bar',
      ],
    })

    const packages = await getPackages(packagesPath)

    expect(packages.includes('foo')).toBe(true)
    expect(packages.includes('bar')).toBe(true)
  })

  it('should exclude packages if set exclude packages', async () => {
    clearMockMonorepo = await createMockMonorepo({
      name: MOCK_MONOREPO_NAME,
      packagesFolder: 'packages',
      packages: [
        'foo',
        'bar',
      ],
    })

    const packages = await getPackages(packagesPath, ['bar'])

    expect(packages.includes('foo')).toBe(true)
    expect(packages.includes('bar')).toBe(false)
  })

  it('should throw error if packages path not exists', async () => {
    try {
      await getPackages(path.join(process.cwd(), 'not-exists-packages'))
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
      await getPackages(packagesPath)
    }
    catch (error) {
      expect(error.message.includes('No packages')).toBe(true)
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
