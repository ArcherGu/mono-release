import type { InlineConfig, PackageManager } from './config'
import { execSync } from 'node:child_process'
import path from 'node:path'
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

  let [pkgName, version] = tag.split('@')

  if (version.startsWith('v'))
    version = version.slice(1)

  const config = await resolveConfig(inlineConfig)
  const {
    cwd = process.cwd(),
    packagesPath = path.join(cwd, 'packages'),
    dry: isDryRun = false,
    branch,
    skipBranchCheck,
    packageManager = 'npm',
    beforePublish,
  } = config
  const { runIfNotDry } = getRunner(isDryRun)

  if (branch) {
    if (skipBranchCheck)
      logger.warn(pkgName, 'Branch check is disabled. This may cause you to release on a wrong branch. Please know what you are doing.\n')
    else
      await branchCheck(branch)
  }

  const { currentVersion, pkgDir } = getPackageInfo(pkgName, packagesPath)
  if (currentVersion !== version)
    throw new Error(`Package version from tag "${version}" mismatches with current version "${currentVersion}"`)

  // run before publish
  if (beforePublish) {
    logger.info(pkgName, 'Running before publish...')

    const beforePublishArr = Array.isArray(beforePublish) ? beforePublish : [beforePublish]
    for (const before of beforePublishArr) {
      if (typeof before === 'string') {
        // default cwd is package dir
        const stdout = execSync(before, { cwd: pkgDir })
        logger.info(pkgName, stdout.toString())
      }
      else if (typeof beforePublish === 'function') {
        await beforePublish(pkgName, currentVersion)
      }
      else if (
        typeof before === 'object'
        && (!before.package || before.package === pkgName)
      ) {
        if (isDryRun && before.skipInDry)
          continue

        const { command, cwd } = before
        const stdout = execSync(command, { cwd })
        logger.info(pkgName, stdout.toString())
      }
    }
  }

  logger.info(pkgName, 'Publishing package...')
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

  logger.info(pkgName, `Use package manager: ${packageManager}`)
  await runIfNotDry(packageManager, publicArgs, {
    cwd: pkgDir,
  })
}
