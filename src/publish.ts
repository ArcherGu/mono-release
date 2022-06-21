import path from 'path'
import type { InlineConfig } from './config'
import { resolveConfig } from './config'
import { getPackageInfo, getRunner, step } from './utils'

export async function publish(tag: string, inlineConfig: InlineConfig = {}) {
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
  } = config
  const { runIfNotDry } = getRunner(isDryRun)

  const { currentVersion, pkgDir } = getPackageInfo(pkgName, packagesPath)
  if (currentVersion !== version) {
    throw new Error(
      `Package version from tag "${version}" mismatches with current version "${currentVersion}"`,
    )
  }

  step('Publishing package...')
  const releaseTag = version.includes('beta')
    ? 'beta'
    : version.includes('alpha')
      ? 'alpha'
      : undefined

  const publicArgs = ['publish', '--access', 'public']
  if (releaseTag)
    publicArgs.push('--tag', releaseTag)

  await runIfNotDry('npm', publicArgs, {
    cwd: pkgDir,
  })
}
