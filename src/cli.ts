import { readFileSync } from 'fs'
import { join } from 'path'
import { cac } from 'cac'
import type { ReleaseOptions } from './release'
import { createLogger } from './log'

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
  .option('-p, --package <name>', 'Package which will be released')
  .option('--changelog', 'Generate changelog')
  .option('--exclude <names>', 'Excludes specified packages')
  .option('--push', 'Auto push to remote after release')
  .action(async (options: ReleaseOptions & CommonCLIOptions) => {
    const { release } = await import('./release')
    try {
      await release({
        configFile: options.config,
        package: options.package,
        changelog: options.changelog,
        exclude: options.exclude,
        dry: options.dry,
        push: options.push,
        branch: options.branch,
      })
    }
    catch (e) {
      logger.error(e)
      process.exit(1)
    }
  })

cli.command('publish <pkg@version>', 'Publish package')
  .option('<pkg@version>', 'Package with version, must be in format <pkg>@<version>')
  .action(async (tag: string, options: CommonCLIOptions) => {
    const { publish } = await import('./publish')
    try {
      await publish(tag, {
        configFile: options.config,
        dry: options.dry,
        branch: options.branch,
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