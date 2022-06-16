import path from 'path'
import prompts from 'prompts'
import semver from 'semver'
import colors from 'picocolors'
import {
  args,
  getPackageInfo,
  getPackages,
  getVersionChoices,
  isDryRun,
  logRecentCommits,
  run,
  runIfNotDry,
  step,
  updateVersion,
} from './utils'
import { resolveConfig } from './config'

async function main(): Promise<void> {
  let targetVersion: string | undefined

  const config = await resolveConfig()

  const packages = await getPackages(config)

  const { pkg }: { pkg: string } = await prompts({
    type: 'select',
    name: 'pkg',
    message: 'Select package',
    choices: packages.map(i => ({ value: i, title: i })),
  })

  if (!pkg)
    return

  await logRecentCommits(pkg)

  const { packagesPath = path.join(process.cwd(), 'packages') } = config

  const { currentVersion, pkgName, pkgPath, pkgDir } = getPackageInfo(pkg, packagesPath)

  if (!targetVersion) {
    const { release }: { release: string } = await prompts({
      type: 'select',
      name: 'release',
      message: 'Select release type',
      choices: getVersionChoices(currentVersion),
    })

    if (release === 'custom') {
      const res: { version: string } = await prompts({
        type: 'text',
        name: 'version',
        message: 'Input custom version',
        initial: currentVersion,
      })
      targetVersion = res.version
    }
    else {
      targetVersion = release
    }
  }

  if (!semver.valid(targetVersion))
    throw new Error(`invalid target version: ${targetVersion}`)

  const tag = `${pkgName}@${targetVersion}`

  if (targetVersion.includes('beta') && !args.tag)
    args.tag = 'beta'

  if (targetVersion.includes('alpha') && !args.tag)
    args.tag = 'alpha'

  const { yes }: { yes: boolean } = await prompts({
    type: 'confirm',
    name: 'yes',
    message: `Releasing ${colors.yellow(tag)} Confirm?`,
  })

  if (!yes)
    return

  step('\nUpdating package version...')
  updateVersion(pkgPath, targetVersion)

  if (config.changelog) {
    step('\nGenerating changelog...')
    const changelogArgs = [
      'conventional-changelog',
      '-p',
      'angular',
      '-i',
      'CHANGELOG.md',
      '-s',
      '--commit-path',
      '.',
    ]
    changelogArgs.push('--lerna-package', pkgName)
    await run('npx', changelogArgs, { cwd: pkgDir })
  }

  const { stdout } = await run('git', ['diff'], { stdio: 'pipe' })
  if (stdout) {
    step('\nCommitting changes...')
    await runIfNotDry('git', ['add', '-A'])
    await runIfNotDry('git', ['commit', '-m', `release: ${tag}`])
    await runIfNotDry('git', ['tag', tag])
  }
  else {
    console.log('No changes to commit.')
    return
  }

  step('\nPushing...')
  await runIfNotDry('git', ['push'])
  await runIfNotDry('git', ['push', 'origin', `refs/tags/${tag}`])

  if (isDryRun)
    console.log('\nDry run finished - run git diff to see package changes.')

  console.log()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
