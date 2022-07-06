import path from 'path'
import fs from 'fs'
import JoyCon from 'joycon'
import strip from 'strip-json-comments'
import { bundleRequire } from 'bundle-require'
import { checkPackageExists } from 'check-package-exists'
import { createLogger } from './log'

export interface InlineConfig extends Omit<UserConfig, 'packagesPath'> {
  configFile?: string
  specifiedPackage?: string
}

export interface UserConfig {
  /**
   * monorepo packages path
   * @default 'packages'
   */
  packagesPath?: string
  /**
   * Allowed branch, if specified, this tool will only work on specified branch, or throw error
   */
  branch?: string
  /**
   * include packages, if specified, this tool will only work on specified packages
   * @note `exclude` will override `include`
   */
  include?: string[]
  /**
   * exclude packages
   */
  exclude?: string[]
  /**
   * if [conventional-changelog-cli](https://www.npmjs.com/package/conventional-changelog-cli) is installed, it will be used, otherwise it will be ignored, or use boolean value to control
   * @default true
   */
  changelog?: boolean
  /**
   * dry run
   * @default false
   */
  dry?: boolean
  /**
   * Automatically push to remote after release
   * @default true
   */
  push?: boolean
  /**
   * Commit check, warning: If disabled, you may lose all uncommited changes
   * @default true
   */
  commitCheck?: boolean
}

export interface ResolvedUserConfig extends UserConfig {
  cwd?: string
  specifiedPackage?: string
}

export type UserConfigExport = UserConfig | Promise<UserConfig>

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
export async function resolveConfig(inlineConfig: InlineConfig, cwd: string = process.cwd()): Promise<ResolvedUserConfig> {
  const logger = createLogger()
  const { configFile } = inlineConfig
  let configPath: string | null = null

  if (configFile) {
    if (path.isAbsolute(configFile))
      configPath = configFile

    else
      configPath = path.resolve(cwd, configFile)
  }
  else {
    const CONFIG_FILE = 'mono-release.config'
    const configJoycon = new JoyCon()
    configPath = await configJoycon.resolve({
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
  }

  let config: UserConfig = {}
  if (configPath) {
    if (configPath.endsWith('.json')) {
      const jsonCfg = await loadJson(configPath)
      if (configPath.endsWith('package.json'))
        config = jsonCfg['mono-release']

      else
        config = jsonCfg
    }
    else {
      const fileCfg = await bundleRequire({
        filepath: configPath,
      })

      config = fileCfg.mod.default || fileCfg.mod
    }
  }

  // resolve packagesPath
  if (config.packagesPath) {
    if (!path.isAbsolute(config.packagesPath))
      config.packagesPath = path.join(cwd, config.packagesPath)
  }
  else {
    config.packagesPath = path.join(cwd, 'packages')
  }

  // resolve changelog
  if (inlineConfig.changelog !== undefined)
    config.changelog = inlineConfig.changelog

  if (!checkPackageExists('conventional-changelog-cli') && config.changelog !== false) {
    logger.warn('\n "conventional-changelog-cli" is not installed, changelog will not be generated.\n')
    config.changelog = false
  }
  else {
    config.changelog = true
  }

  // resolve include
  config.include = inlineConfig.include ?? config.include ?? []

  // resolve exclude
  config.exclude = inlineConfig.exclude ?? config.exclude ?? []

  // resolve dry
  if (inlineConfig.dry !== undefined)
    config.dry = inlineConfig.dry

  // resolve push
  if (inlineConfig.push !== undefined)
    config.push = inlineConfig.push

  // resolve branch
  if (typeof inlineConfig.branch === 'string' || inlineConfig.branch === false)
    config.branch = inlineConfig.branch

  // resolve commitCheck
  if (inlineConfig.commitCheck !== undefined)
    config.commitCheck = inlineConfig.commitCheck

  return {
    cwd,
    specifiedPackage: inlineConfig.specifiedPackage,
    ...config,
  }
}

/**
 * Type helper to make it easier to use mono-release.config.ts
 */
export function defineConfig(config: UserConfigExport): UserConfigExport {
  return config
}
