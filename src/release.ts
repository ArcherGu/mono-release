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
  logLastCommit,
  logRecentCommits,
  run,
  runIfNotDry,
  step,
  updateVersion,
} from './utils'
import { resolveConfig } from './config'
import { Rollback } from './rollback'

const rb = new Rollback()

async function main(): Promise<void> {
  const { stdout: diffCheck } = await run('git', ['diff'], { stdio: 'pipe' })
  const { stdout: cacheCheck } = await run('git', ['diff', '--cached'], { stdio: 'pipe' })
  if (diffCheck || cacheCheck) {
    console.log(
      colors.red(
        'You have uncommited changes. Please commit them first. Exiting...',
      ),
    )
    return
  }

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

  const { packagesPath = path.join(process.cwd(), 'packages') } = config

  await logRecentCommits(pkg, packagesPath)

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

  rb.add(async () => {
    await runIfNotDry('git', ['checkout', '.'], { stdio: 'pipe' })
    Rollback.printInfo('Rollback: Files change')
  })

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
    rb.add(async () => {
      await runIfNotDry('git', ['reset', 'HEAD'], { stdio: 'pipe' })
      Rollback.printInfo('Rollback: Cancel git add')
    })

    await runIfNotDry('git', ['commit', '-m', `release: ${tag}`])
    rb.add(async () => {
      await runIfNotDry('git', ['reset', '--soft', 'HEAD^'])
      Rollback.printInfo('Rollback: Cancel git commit')
    })

    await runIfNotDry('git', ['tag', tag])
    rb.add(async () => {
      await runIfNotDry('git', ['tag', '-d', tag], { stdio: 'pipe' })
      Rollback.printInfo(`Rollback: Delete tag ${tag}`)
    })
  }
  else {
    console.log('No changes to commit.')
    return
  }

  step('\nPushing...')
  try {
    await runIfNotDry('git', ['push'])
  }
  catch (err) {
    console.error(err)
    console.log()
    const { yes }: { yes: boolean } = await prompts({
      type: 'confirm',
      name: 'yes',
      message: colors.yellow('Push failed. Rollback?'),
    })

    if (yes) {
      await rb.rollback()
      return
    }
    else {
      console.log(`
        You can manually run:
        ${colors.yellow('git push')}
        ${colors.yellow(`git push origin refs/tags/${tag}`)}
      `)

      return
    }
  }

  try {
    await runIfNotDry('git', ['push', 'origin', `refs/tags/${tag}`])
  }
  catch (err) {
    console.error(err)
    console.log()
    const { yes }: { yes: boolean } = await prompts({
      type: 'confirm',
      name: 'yes',
      message: colors.yellow('Push tag failed, rollback ?'),
    })

    if (yes) {
      console.log(colors.cyan('You may need to manually rollback the commit on remote git:'))
      await logLastCommit()

      await rb.rollback()
      return
    }
    else {
      console.log(`
        You can manually run:
        ${colors.yellow(`git push origin refs/tags/${tag}`)}
      `)

      return
    }
  }

  if (isDryRun)
    console.log('\nDry run finished - run git diff to see package changes.')

  console.log()
}

main().catch(async (err) => {
  console.error(err)
  await rb.rollback()
  process.exit(1)
})
