import path from 'path'
import prompts from 'prompts'
import semver from 'semver'
import { yellow } from 'colorette'
import {
  branchCheck,
  getPackageInfo,
  getPackages,
  getRunner,
  getVersionChoices,
  logLastCommit,
  logRecentCommits,
  updateVersion,
} from './utils'
import type { InlineConfig } from './config'
import { resolveConfig } from './config'
import { Rollback } from './rollback'
import { createLogger } from './log'

export interface ReleaseOptions {
  p?: string
  specifiedPackage?: string
  changelog?: boolean
  include?: string // string,string,...
  exclude?: string // string,string,...
  push?: boolean
}

export async function release(inlineConfig: InlineConfig = {}) {
  const logger = createLogger()
  const rb = new Rollback()
  try {
    const config = await resolveConfig(inlineConfig)
    const {
      cwd = process.cwd(),
      packagesPath = path.join(cwd, 'packages'),
      specifiedPackage,
      changelog,
      include = [],
      exclude = [],
      dry: isDryRun = false,
      push: autoPush = true,
      branch = false,
    } = config

    const { run, runIfNotDry } = getRunner(isDryRun)

    const { stdout: diffCheck } = await run('git', ['diff'], { stdio: 'pipe' })
    const { stdout: cacheCheck } = await run('git', ['diff', '--cached'], { stdio: 'pipe' })
    if (diffCheck || cacheCheck)
      throw new Error('You have uncommited changes. Please commit them first.')

    if (branch) {
      const checkResult = await branchCheck(branch)
      if (!checkResult)
        throw new Error(`You are not on branch "${branch}". Please switch to it first.`)
    }

    let pkg: string | undefined
    if (specifiedPackage) {
      // specifiedPackage will ignore `exclude`
      const packages = await getPackages(packagesPath)
      if (!packages.includes(specifiedPackage))
        throw new Error(`Package "${specifiedPackage}" is not found in ${packagesPath}`)

      pkg = specifiedPackage
    }
    else {
      let packages = await getPackages(packagesPath, exclude)
      packages = include.length > 0 ? packages.filter(p => include.includes(p)) : packages

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
      throw new Error(`Invalid target version: ${targetVersion}`)

    const tag = `${pkgName}@${targetVersion}`

    const { yes }: { yes: boolean } = await prompts({
      type: 'confirm',
      name: 'yes',
      message: `Releasing ${yellow(tag)} Confirm?`,
    })

    if (!yes)
      return

    logger.info('\nUpdating package version...')

    rb.add(async () => {
      await runIfNotDry('git', ['checkout', '.'], { stdio: 'pipe' })
      logger.warn('Rollback: Files change')
    })

    updateVersion(pkgPath, targetVersion)

    if (changelog) {
      logger.info('\nGenerating changelog...')
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
      logger.info('\nCommitting changes...')

      await runIfNotDry('git', ['add', '-A'])
      rb.add(async () => {
        await runIfNotDry('git', ['reset', 'HEAD'], { stdio: 'pipe' })
        logger.warn('Rollback: Cancel git add')
      })

      await runIfNotDry('git', ['commit', '-m', `release: ${tag}`])
      rb.add(async () => {
        await runIfNotDry('git', ['reset', '--soft', 'HEAD^'])
        logger.warn('Rollback: Cancel git commit')
      })

      await runIfNotDry('git', ['tag', tag])
      rb.add(async () => {
        await runIfNotDry('git', ['tag', '-d', tag], { stdio: 'pipe' })
        logger.warn(`Rollback: Delete tag ${tag}`)
      })
    }
    else {
      logger.warn('No changes to commit.')
      return
    }

    if (!autoPush) {
      logger.info(`
        Release is done. You can push the changes to remote repository by running:
        ${yellow('git push')}
        ${yellow(`git push origin refs/tags/${tag}`)}
      `)
    }
    else {
      logger.info('\nPushing...')
      try {
        await runIfNotDry('git', ['push'])
      }
      catch (err) {
        logger.error(err)
        logger.break()
        const { yes }: { yes: boolean } = await prompts({
          type: 'confirm',
          name: 'yes',
          message: yellow('Push failed. Rollback?'),
        })

        if (yes) {
          await rb.rollback()
          return
        }
        else {
          logger.info(`
            You can manually run:
            ${yellow('git push')}
            ${yellow(`git push origin refs/tags/${tag}`)}
          `)

          return
        }
      }

      try {
        await runIfNotDry('git', ['push', 'origin', `refs/tags/${tag}`])
      }
      catch (err) {
        logger.error(err)
        logger.break()
        const { yes }: { yes: boolean } = await prompts({
          type: 'confirm',
          name: 'yes',
          message: yellow('Push tag failed, rollback ?'),
        })

        if (yes) {
          logger.warn('You may need to manually rollback the commit on remote git:')
          await logLastCommit()

          await rb.rollback()
          return
        }
        else {
          logger.info(`
            You can manually run:
            ${yellow(`git push origin refs/tags/${tag}`)}
          `)

          return
        }
      }
    }

    if (isDryRun)
      logger.info('\nDry run finished - run git diff to see package changes.')
  }
  catch (error) {
    await rb.rollback()
    throw error
  }
}
