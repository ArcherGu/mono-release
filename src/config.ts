import path from 'path'
import fs from 'fs'
import JoyCon from 'joycon'
import strip from 'strip-json-comments'
import { bundleRequire } from 'bundle-require'
import { checkPackageExists } from 'check-package-exists'
import colors from 'picocolors'

export interface ReleaseConfig {
  /**
   * monorepo packages path
   * @default 'packages'
   */
  packagesPath?: string
  /**
   * exclude packages
   */
  exclude?: string[]
  /**
   * if [conventional-changelog-cli](https://www.npmjs.com/package/conventional-changelog-cli) is installed, it will be used, otherwise it will be ignored, or use boolean value to control
   * @default true
   */
  changelog?: boolean
}

export interface ResolvedReleaseConfig extends ReleaseConfig {
  cwd?: string
}

export type ReleaseConfigExport = ReleaseConfig | Promise<ReleaseConfig>

function jsoncParse(data: string) {
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`return ${strip(data).trim()}`)()
  }
  catch {
    // Silently ignore any error
    // That's what tsc/jsonc-parser did after all
    return {}
  }
}

async function loadJson(filepath: string) {
  try {
    return jsoncParse(await fs.promises.readFile(filepath, 'utf8'))
  }
  catch (error) {
    if (error instanceof Error) {
      throw new TypeError(
        `Failed to parse ${path.relative(process.cwd(), filepath)}: ${error.message
        }`,
      )
    }
    else {
      throw error
    }
  }
}

/**
 * Resolve mono-release config
 */
export async function resolveConfig(cwd?: string): Promise<ResolvedReleaseConfig> {
  cwd = cwd || process.cwd()
  const CONFIG_FILE = 'mono-release.config'
  const configJoycon = new JoyCon()
  const configPath = await configJoycon.resolve({
    files: [
      `${CONFIG_FILE}.ts`,
      `${CONFIG_FILE}.js`,
      `${CONFIG_FILE}.cjs`,
      `${CONFIG_FILE}.mjs`,
      `${CONFIG_FILE}.json`,
      'package.json',
    ],
    cwd,
    stopDir: path.parse(cwd).root,
    packageKey: 'mono-release',
  })

  let data: ReleaseConfig = {}
  if (configPath) {
    if (configPath.endsWith('.json')) {
      const config = await loadJson(configPath)
      if (configPath.endsWith('package.json'))
        data = config['mono-release']

      else
        data = config
    }
    else {
      const config = await bundleRequire({
        filepath: configPath,
      })

      data = config.mod.default || config.mod
    }
  }

  // resolve packagesPath
  if (data.packagesPath) {
    if (!path.isAbsolute(data.packagesPath))
      data.packagesPath = path.join(cwd, data.packagesPath)
  }
  else {
    data.packagesPath = path.join(cwd, 'packages')
  }

  // resolve changelog
  if (!checkPackageExists('conventional-changelog-cli') && data.changelog !== false) {
    console.log(
      colors.yellow(
        '\n "conventional-changelog-cli" is not installed, changelog will not be generated.\n',
      ),
    )
    data.changelog = false
  }
  else {
    data.changelog = true
  }

  return {
    cwd,
    ...data,
  }
}

/**
 * Type helper to make it easier to use mono-release.config.ts
 */
export function defineConfig(config: ReleaseConfigExport): ReleaseConfigExport {
  return config
}
