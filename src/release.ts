import path from 'node:path'
import { execSync } from 'node:child_process'
import prompts from 'prompts'
import semver from 'semver'
import { green, yellow } from 'colorette'
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
import { TAG, createLogger } from './log'

export interface ReleaseOptions {
  p?: string
  specifiedPackage?: string
  changelog?: boolean
  include?: string // string,string,...
  exclude?: string // string,string,...
  disablePush?: boolean
  commitCheck?: boolean
  beforeRelease?: string
  disableRelationship?: boolean
  commitMessagePlaceholder?: string
  ci?: boolean
  ciMsgSuffix?: string
  versionType?: string // next,alpha-minor,alpha-major,beta-minor,beta-major,minor,major
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
      branch,
      commitCheck = true,
      beforeRelease,
      relationships = [],
      disableRelationship = false,
      commitMessagePlaceholder = '',
      ci = false,
      ciMsgSuffix,
      versionType,
    } = config

    const { run, runIfNotDry } = getRunner(isDryRun)

    if (ci) {
      logger.info(TAG, 'Running in CI mode, will skip all select actions.')
      if (!specifiedPackage)
        throw new Error('You must specify one package when running in CI mode, use --specified-package <name>')
    }

    if (commitCheck) {
      const { stdout: diffCheck } = await run('git', ['diff'], { stdio: 'pipe' })
      const { stdout: cacheCheck } = await run('git', ['diff', '--cached'], { stdio: 'pipe' })
      if (diffCheck || cacheCheck)
        throw new Error('You have uncommited changes. Please commit them first.')
    }
    else {
      logger.warn(TAG, 'Commit check is disabled. This may cause you to lose all uncommited changes.\n')
    }

    if (branch)
      await branchCheck(branch)

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
    const versionChoices = getVersionChoices(currentVersion)
    if (ci) {
      targetVersion = versionChoices.find(e => e.title.includes(versionType ?? 'next'))?.value
    }
    else {
      if (versionType)
        targetVersion = versionChoices.find(e => e.title.includes(versionType))?.value

      if (!targetVersion) {
        const { releaseType }: { releaseType: string } = await prompts({
          type: 'select',
          name: 'releaseType',
          message: `[${green(pkgName)}] Select release type`,
          choices: getVersionChoices(currentVersion),
        })

        if (releaseType === 'custom') {
          const res: { version: string } = await prompts({
            type: 'text',
            name: 'version',
            message: `[${green(pkgName)}] Input custom version`,
            initial: currentVersion,
          })
          targetVersion = res.version
        }
        else {
          targetVersion = releaseType
        }
      }
    }

    if (!targetVersion)
      throw new Error(`[${pkgName}] No target version`)

    if (!semver.valid(targetVersion))
      throw new Error(`[${pkgName}] Invalid target version: ${targetVersion}`)

    logger.info(pkgName, `${ci ? '[CI] ' : ''}Target Version: ${targetVersion}`)

    const tag = `${pkgName}@${targetVersion}`

    let userCommitMsg: string | undefined
    if (!ci) {
      const { msg }: { msg: string } = await prompts({
        type: 'text',
        name: 'msg',
        message: `[${green(pkgName)}] Commit message: `,
        initial: commitMessagePlaceholder.trim(),
        format: (value: string) => value.trim(),
      })

      const { yes }: { yes: boolean } = await prompts({
        type: 'confirm',
        name: 'yes',
        message: `[${green(pkgName)}] Releasing ${yellow(tag)} Confirm?`,
      })

      if (!yes)
        return

      userCommitMsg = msg
    }
    else {
      userCommitMsg = `[CI release]${commitMessagePlaceholder ? ` ${commitMessagePlaceholder}` : ''}${ciMsgSuffix ? ` ${ciMsgSuffix}` : ''}`
      logger.info(pkgName, `[CI] Commit message: "${userCommitMsg}"`)
    }

    rb.add(async () => {
      await runIfNotDry('git', ['checkout', '.'], { stdio: 'pipe' })
      logger.warn(pkgName, 'Rollback: Files change')
    })

    // run before release
    if (beforeRelease) {
      logger.info(pkgName, 'Running before release...')

      const beforeReleaseArr = Array.isArray(beforeRelease) ? beforeRelease : [beforeRelease]
      for (const before of beforeReleaseArr) {
        if (typeof before === 'string') {
          const stdout = execSync(before)
          logger.info(pkgName, stdout.toString())
        }
        else if (typeof before === 'function') {
          await before(pkgName, targetVersion)
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

    logger.info(pkgName, 'Updating package version...')
    updateVersion(pkgPath, targetVersion)

    if (changelog) {
      logger.info(pkgName, 'Generating changelog...')
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
      logger.info(pkgName, 'Committing changes...')

      await runIfNotDry('git', ['add', '-A'])
      rb.add(async () => {
        await runIfNotDry('git', ['reset', 'HEAD'], { stdio: 'pipe' })
        logger.warn(pkgName, 'Rollback: Cancel git add')
      })

      const commitMsg = `release: ${tag}${userCommitMsg ? `\n\n${userCommitMsg}` : ''}`
      await runIfNotDry('git', ['commit', '-m', commitMsg])
      rb.add(async () => {
        await runIfNotDry('git', ['reset', '--soft', 'HEAD^'])
        logger.warn(pkgName, 'Rollback: Cancel git commit')
      })

      await runIfNotDry('git', ['tag', tag])
      rb.add(async () => {
        await runIfNotDry('git', ['tag', '-d', tag], { stdio: 'pipe' })
        logger.warn(pkgName, `Rollback: Delete tag ${tag}`)
      })
    }
    else {
      logger.warn(pkgName, 'No changes to commit.')
      return
    }

    if (!autoPush) {
      logger.info(pkgName, `
        Release is done. You can push the changes to remote repository by running:
        ${yellow('git push')}
        ${yellow(`git push origin refs/tags/${tag}`)}
      `)
    }
    else {
      logger.info(pkgName, 'Pushing...')
      try {
        await runIfNotDry('git', ['push'])
      }
      catch (err) {
        logger.error(pkgName, err)
        logger.break()
        if (ci) {
          logger.warn(pkgName, '[CI] Push failed, auto rollback')
          await rb.rollback()
          process.exit(1)
        }

        const { yes }: { yes: boolean } = await prompts({
          type: 'confirm',
          name: 'yes',
          message: `[${green(pkgName)}] ${yellow('Push failed. Rollback?')}`,
        })

        if (yes) {
          await rb.rollback()
          return
        }
        else {
          logger.info(pkgName, `
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
        logger.error(pkgName, err)
        logger.break()
        if (ci) {
          logger.warn(pkgName, '[CI] Push tag failed, auto rollback')
          await logLastCommit()
          await rb.rollback()
          process.exit(1)
        }

        const { yes }: { yes: boolean } = await prompts({
          type: 'confirm',
          name: 'yes',
          message: `[${green(pkgName)}] ${yellow('Push tag failed, rollback ?')}`,
        })

        if (yes) {
          logger.warn(pkgName, 'You may need to manually rollback the commit on remote git:')
          await logLastCommit()

          await rb.rollback()
          return
        }
        else {
          logger.info(pkgName, `
            You can manually run:
            ${yellow(`git push origin refs/tags/${tag}`)}
          `)

          return
        }
      }
    }

    if (isDryRun) {
      logger.info(pkgName, 'Dry run finished - run git diff to see package changes.')
    }
    else if (
      !disableRelationship
      && relationships && Array.isArray(relationships)
      && autoPush
    ) {
      const validRelationships = relationships.filter(r => r.base === pkg)
      if (validRelationships.length === 0)
        return

      let depPkgs = validRelationships.reduce<string[]>((p, c) => [...p, ...c.pkgs], [])
      depPkgs = Array.from(new Set(depPkgs))

      const upperPkgs = []
      if (!ci) {
        const { yes }: { yes: boolean } = await prompts({
          type: 'confirm',
          name: 'yes',
          message: `\n\nSome upper-level packages depend on [${green(pkgName)}], do you want to release them?`,
        })

        if (!yes)
          return

        const { selectedPkgs }: { selectedPkgs: string[] } = await prompts({
          type: 'multiselect',
          name: 'selectedPkgs',
          message: '\nSelect upper-level packages',
          choices: depPkgs.map(p => ({ value: p, title: p })),
        })

        upperPkgs.push(...selectedPkgs)
      }
      else {
        logger.info(TAG, '[CI] Will auto release upper-level packages')
        upperPkgs.push(...depPkgs)
      }

      for (const pkg of upperPkgs) {
        await release({
          ...inlineConfig,
          specifiedPackage: pkg,
          disableRelationship: true,
        })
      }
    }
  }
  catch (error) {
    await rb.rollback()
    throw error
  }
}
