import { readFileSync } from 'fs'
import { join } from 'path'
import { cac } from 'cac'
import type { ReleaseOptions } from './release'
import { createLogger } from './log'
import type { PublishOptions } from './publish'

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
  .option('--push', 'Auto push to remote after release')
  .option('--no-push', 'Disable auto push to remote after release')
  .option('--commit-check', 'Commit check, you should commit all uncommited changes before release')
  .option('--no-commit-check', 'Disable commit check, warning: this may cause you to lose all uncommited changes when rollback')
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
        push: options.push,
        branch: options.branch,
        commitCheck: options.commitCheck,
      })
    }
    catch (e) {
      logger.error(e)
      process.exit(1)
    }
  })

cli.command('publish <pkg@version>', 'Publish package')
  .option('<pkg@version>', 'Package with version, must be in format <pkg>@<version>')
  .option('-u, --use <PackageManager>', 'Use specified package manager to publish', { default: 'npm' })
  .action(async (tag: string, options: PublishOptions & CommonCLIOptions) => {
    const { publish } = await import('./publish')
    try {
      await publish(tag, {
        configFile: options.config,
        dry: options.dry,
        branch: options.branch,
        packageManager: options.use,
      })
    }
    catch (e) {
      logger.error(e)
      process.exit(1)
    }
  })

cli.help()
const pkgPath = join(__dirname, '../package.json')
cli.version(JSON.parse(readFileSync(pkgPath, 'utf8')).version)

cli.parse()
