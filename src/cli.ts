import { cac } from 'cac'
import { version } from '../package.json'
import type { ReleaseOptions } from './release'

interface CommonCLIOptions {
  '--'?: string[]
  c?: string
  config?: string
  dry?: boolean
}

const cli = cac('mono-release')

cli
  .option('-c, --config <file>', 'Use specified config file')
  .option('--dry', 'Dry run')

cli
  .command('', 'Release package')
  .alias('release')
  .option('-p, --package <name>', 'Package which will be released')
  .option('--changelog', 'Generate changelog')
  .option('--exclude <name>', 'Excludes specified packages')
  .action(async (options: ReleaseOptions & CommonCLIOptions) => {
    const { release } = await import('./release')
    try {
      await release({
        configFile: options.config,
        package: options.package,
        changelog: options.changelog,
        exclude: options.exclude,
        dry: options.dry,
      })
    }
    catch (e) {
      console.error(e)
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
      })
    }
    catch (e) {
      console.error(e)
      process.exit(1)
    }
  })

cli.help()
cli.version(version)

cli.parse()
