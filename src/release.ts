import path from 'path'
import prompts from 'prompts'
import semver from 'semver'
import colors from 'picocolors'
import {
  getPackageInfo,
  getPackages,
  getRunner,
  getVersionChoices,
  logLastCommit,
  logRecentCommits,
  step,
  updateVersion,
} from './utils'
import type { InlineConfig } from './config'
import { resolveConfig } from './config'
import { Rollback } from './rollback'

export interface ReleaseOptions {
  p?: string
  package?: string
  changelog?: boolean
  exclude?: string[]
}

export async function release(inlineConfig: InlineConfig = {}) {
  const rb = new Rollback()
  try {
    const config = await resolveConfig(inlineConfig)
    const {
      cwd = process.cwd(),
      packagesPath = path.join(cwd, 'packages'),
      package: specifiedPackage,
      changelog,
      exclude = [],
      dry: isDryRun = false,
    } = config

    const { run, runIfNotDry } = getRunner(isDryRun)

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

    const packages = await getPackages(packagesPath, exclude)
    let pkg: string | undefined
    if (specifiedPackage) {
      if (!packages.includes(specifiedPackage)) {
        console.log(
          colors.red(
            `Package "${config.package}" is not found in "${colors.green(packagesPath)}". Exiting...`,
          ),
        )
        return
      }
      pkg = specifiedPackage
    }
    else {
      const { pkg: pkgTemp }: { pkg: string } = await prompts({
        type: 'select',
        name: 'pkg',
        message: 'Select package',
        choices: packages.map(i => ({ value: i, title: i })),
      })

      if (!pkgTemp)
        return

      pkg = pkgTemp
    }

    await logRecentCommits(pkg, packagesPath)

    const { currentVersion, pkgName, pkgPath, pkgDir } = getPackageInfo(pkg, packagesPath)

    let targetVersion: string | undefined
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

    if (!semver.valid(targetVersion))
      throw new Error(`invalid target version: ${targetVersion}`)

    const tag = `${pkgName}@${targetVersion}`

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

    if (changelog) {
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
  catch (error) {
    await rb.rollback()
    throw error
  }
}
