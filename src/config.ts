import path from 'node:path'
import fs from 'node:fs'
import JoyCon from 'joycon'
import strip from 'strip-json-comments'
import { bundleRequire } from 'bundle-require'
import { checkPackageExists } from 'check-package-exists'
import { TAG, createLogger } from './log'
import type { VERSION_TYPE } from './constants'

export type PackageManager = 'npm' | 'yarn' | 'pnpm'

export type VersionType = typeof VERSION_TYPE[number]

export interface RelationshipOpt {
  /**
   * Package's names
   */
  pkgs: string[]
  /**
   * dependent package
   */
  base: string
}

export interface InlineConfig extends Omit<UserConfig, 'packagesPath'> {
  configFile?: string
  /**
   * Specified package which will be released, skip selector, ignore `exclude`
   */
  specifiedPackage?: string
  /**
   * Run in CI mode, will skip all select actions, you must specify `--specified-package`
   * @default false
   */
  ci?: boolean
  /**
   * Disable auto push to remote after release
   * @default false
   */
  disablePush?: boolean
}

export type BeforeHook =
  string |
  ((pkgName: string, version: string) => Promise<void>) |
  {
    command: string
    cwd?: string
    /**
     * If specified, only run this hook when release/public this package
     */
    package?: string
    /**
     * Skip this hook when running in dry mode
     */
    skipInDry?: boolean
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
   * Commit check
   * @warning If disabled, you may lose all uncommited changes when rollback.
   * @default true
   */
  commitCheck?: boolean
  /**
   * Package manager to publish
   * @default 'npm'
   */
  packageManager?: PackageManager
  /**
   * You can specify command/function to be executed before release
   */
  beforeRelease?: BeforeHook | BeforeHook[]
  /**
   * You can specify command/function to be executed before publish
   * @Note the default cwd is the package directory when running before publish command
   */
  beforePublish?: BeforeHook | BeforeHook[]
  /**
   * Dependencies relationship, when the base package is released, the upper-level packages can also be released
   */
  relationships?: RelationshipOpt[]
  /**
   * Disable relationship release
   */
  disableRelationship?: boolean
  /**
   * Placeholder of commit message
   */
  commitMessagePlaceholder?: string
  /**
   * Default version type, if you specify it, will skip version select action
   *
   * Available values: next, alpha-minor, alpha-major, beta-minor, beta-major, minor, major
   * @default undefined
   */
  versionType?: VersionType
}

export interface ResolvedUserConfig extends UserConfig {
  cwd?: string
  specifiedPackage?: string
  ci?: boolean
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
        `Failed to parse ${path.relative(process.cwd(), filepath)}: ${error.message}`,
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
    logger.warn(TAG, '"conventional-changelog-cli" is not installed, changelog will not be generated.\n')
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
  if (inlineConfig.disablePush !== undefined)
    config.push = !inlineConfig.disablePush

  // resolve branch
  if (typeof inlineConfig.branch === 'string' || inlineConfig.branch === false)
    config.branch = inlineConfig.branch

  // resolve commitCheck
  if (inlineConfig.commitCheck !== undefined)
    config.commitCheck = inlineConfig.commitCheck

  // resolve packageManager
  if (inlineConfig.packageManager && ['npm', 'yarn', 'pnpm'].includes(inlineConfig.packageManager))
    config.packageManager = inlineConfig.packageManager

  // resolve beforeRelease
  if (inlineConfig.beforeRelease)
    config.beforeRelease = inlineConfig.beforeRelease

  // resolve beforePublish
  if (inlineConfig.beforePublish)
    config.beforePublish = inlineConfig.beforePublish

  // resolve commitMessagePlaceholder
  if (inlineConfig.commitMessagePlaceholder)
    config.commitMessagePlaceholder = inlineConfig.commitMessagePlaceholder

  // resolve versionType
  if (inlineConfig.versionType)
    config.versionType = inlineConfig.versionType

  return {
    cwd,
    specifiedPackage: inlineConfig.specifiedPackage,
    ci: inlineConfig.ci,
    ...config,
  }
}

/**
 * Type helper to make it easier to use mono-release.config.ts
 */
export function defineConfig(config: UserConfigExport): UserConfigExport {
  return config
}
