import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cac } from 'cac'
import type { ReleaseOptions } from './release'
import { TAG, createLogger } from './log'
import type { PublishOptions } from './publish'
import type { VersionType } from './config'

interface CommonCLIOptions {
  '--'?: string[]
  c?: string
  config?: string
  b?: string
  branch?: string
  dry?: boolean
}

const cli = cac('mono-release')
const logger = createLogger()

cli
  .option('-c, --config <file>', 'Use specified config file')
  .option('-b, --branch <name>', 'Use specified branch')
  .option('--dry', 'Dry run, change file but not running any git actions')

cli
  .command('', 'Release package')
  .alias('release')
  .option('-p, --specified-package <name>', 'Specified package which will be released, skip selector, ignore `exclude`')
  .option('--changelog', 'Generate changelog')
  .option('--no-changelog', 'Disable changelog')
  .option('--include <names>', 'Include specified packages, `exclude` will override it')
  .option('--exclude <names>', 'Excludes specified packages')
  .option('--disable-push', 'Disable auto push to remote after release')
  .option('--commit-check', 'Commit check, you should commit all uncommited changes before release')
  .option('--no-commit-check', 'Disable commit check, warning: this may cause you to lose all uncommited changes when rollback')
  .option('--before-release <command>', 'Run command before release')
  .option('--disable-relationship', 'Disable relationship release')
  .option('--commit-message-placeholder', 'Commit message placeholder')
  .option('--ci', 'Run in CI mode, will skip all select actions, you must specify `--specified-package`')
  .option('--ci-msg-suffix', 'In CI mode, you can specify a suffix for commit message, for example: `[skip ci]`')
  .option('--version-type', 'Default version type, if you specify it, will skip version select action: next,alpha-minor,alpha-major,beta-minor,beta-major,minor,major')
  .action(async (options: ReleaseOptions & CommonCLIOptions) => {
    const { release } = await import('./release')
    try {
      await release({
        configFile: options.config,
        specifiedPackage: options.specifiedPackage,
        changelog: options.changelog,
        include: options.include?.split(','),
        exclude: options.exclude?.split(','),
        dry: options.dry,
        disablePush: options.disablePush,
        branch: options.branch,
        commitCheck: options.commitCheck,
        beforeRelease: options.beforeRelease,
        disableRelationship: !!options.disableRelationship,
        commitMessagePlaceholder: options.commitMessagePlaceholder,
        ci: options.ci,
        ciMsgSuffix: options.ciMsgSuffix,
        versionType: options.versionType as VersionType,
      })
    }
    catch (e) {
      logger.error(TAG, e)
      process.exit(1)
    }
  })

cli.command('publish <pkg@version>', 'Publish package')
  .option('<pkg@version>', 'Package with version, must be in format <pkg>@<version>')
  .option('-u, --use <PackageManager>', 'Use specified package manager to publish', { default: 'npm' })
  .option('--before-publish <command>', 'Run command before publish')
  .action(async (tag: string, options: PublishOptions & CommonCLIOptions) => {
    const { publish } = await import('./publish')
    try {
      await publish(tag, {
        configFile: options.config,
        dry: options.dry,
        branch: options.branch,
        packageManager: options.use,
        beforePublish: options.beforePublish,
      })
    }
    catch (e) {
      logger.error(TAG, e)
      process.exit(1)
    }
  })

cli.help()
const pkgPath = join(__dirname, '../package.json')
cli.version(JSON.parse(readFileSync(pkgPath, 'utf8')).version)

cli.parse()
