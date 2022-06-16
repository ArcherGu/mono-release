import path from 'path'
import { resolveConfig } from './config'
import { args, getPackageInfo, publishPackage, step } from './utils'

async function main() {
  const tag = args._[0]

  if (!tag)
    throw new Error('No tag specified')

  if (!tag.includes('@'))
    throw new Error(`Invalid tag: ${tag}, must be in format <pkg>@<version>`)

  // eslint-disable-next-line prefer-const
  let [pkgName, version] = tag.split('@')

  if (version.startsWith('v'))
    version = version.slice(1)

  const config = await resolveConfig()
  const { packagesPath = path.join(process.cwd(), 'packages') } = config
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
  await publishPackage(pkgDir, releaseTag)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
