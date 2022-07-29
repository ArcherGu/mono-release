import path from 'path'
import type { InlineConfig, PackageManager } from './config'
import { resolveConfig } from './config'
import { createLogger } from './log'
import { branchCheck, getPackageInfo, getRunner } from './utils'

export interface PublishOptions {
  u?: PackageManager
  use?: PackageManager
  beforePublish?: string
}

export async function publish(tag: string, inlineConfig: InlineConfig = {}) {
  const logger = createLogger()
  if (!tag)
    throw new Error('No tag specified')

  if (!tag.includes('@'))
    throw new Error(`Invalid tag: ${tag}, must be in format <pkg>@<version>`)

  // eslint-disable-next-line prefer-const
  let [pkgName, version] = tag.split('@')

  if (version.startsWith('v'))
    version = version.slice(1)

  const config = await resolveConfig(inlineConfig)
  const {
    cwd = process.cwd(),
    packagesPath = path.join(cwd, 'packages'),
    dry: isDryRun = false,
    branch = false,
    packageManager = 'npm',
    beforePublish,
  } = config
  const { run, runIfNotDry } = getRunner(isDryRun)

  if (branch) {
    const checkResult = await branchCheck(branch)
    if (!checkResult)
      throw new Error(`You are not on branch "${branch}". Please switch to it first.`)
  }

  const { currentVersion, pkgDir } = getPackageInfo(pkgName, packagesPath)
  if (currentVersion !== version) {
    throw new Error(
      `Package version from tag "${version}" mismatches with current version "${currentVersion}"`,
    )
  }

  // run before publish
  if (beforePublish)
    logger.info('\nRunning before publish...')

  if (typeof beforePublish === 'string') {
    // default cwd is package dir
    await run(beforePublish, [], { cwd: pkgDir })
  }
  else if (typeof beforePublish === 'function') {
    await beforePublish(pkgName, currentVersion)
  }
  else if (typeof beforePublish === 'object') {
    const { command, cwd } = beforePublish
    await run(command, [], { cwd })
  }

  logger.info('Publishing package...')
  const releaseTag = version.includes('beta')
    ? 'beta'
    : version.includes('alpha')
      ? 'alpha'
      : undefined

  const publicArgs = ['publish', '--access', 'public']

  // special handling for package manager
  if (packageManager === 'yarn')
    publicArgs.push('--new-version', version)

  else if (packageManager === 'pnpm')
    publicArgs.push('--no-git-checks')

  if (releaseTag)
    publicArgs.push('--tag', releaseTag)

  logger.info(`Use package manager: ${packageManager}`)
  await runIfNotDry(packageManager, publicArgs, {
    cwd: pkgDir,
  })
}
