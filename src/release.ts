import path from 'path'
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
import { createLogger } from './log'

export interface ReleaseOptions {
  p?: string
  specifiedPackage?: string
  changelog?: boolean
  include?: string // string,string,...
  exclude?: string // string,string,...
  push?: boolean
  commitCheck?: boolean
  beforeRelease?: string
  disableRelationship?: boolean
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
      commitCheck = true,
      beforeRelease,
      relationships = [],
      disableRelationship = false,
    } = config

    const { run, runIfNotDry } = getRunner(isDryRun)

    if (commitCheck) {
      const { stdout: diffCheck } = await run('git', ['diff'], { stdio: 'pipe' })
      const { stdout: cacheCheck } = await run('git', ['diff', '--cached'], { stdio: 'pipe' })
      if (diffCheck || cacheCheck)
        throw new Error('You have uncommited changes. Please commit them first.')
    }
    else {
      logger.warn('\nCommit check is disabled. This may cause you to lose all uncommited changes.\n')
    }

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

    if (!semver.valid(targetVersion))
      throw new Error(`[${green(pkgName)}] Invalid target version: ${targetVersion}`)

    const tag = `${pkgName}@${targetVersion}`

    const { msg }: { msg: string } = await prompts({
      type: 'text',
      name: 'msg',
      message: `[${green(pkgName)}] Commit message: `,
      format: (value: string) => value.trim(),
    })

    const { yes }: { yes: boolean } = await prompts({
      type: 'confirm',
      name: 'yes',
      message: `[${green(pkgName)}] Releasing ${yellow(tag)} Confirm?`,
    })

    if (!yes)
      return

    rb.add(async () => {
      await runIfNotDry('git', ['checkout', '.'], { stdio: 'pipe' })
      logger.warn(`[${green(pkgName)}] Rollback: Files change`)
    })

    // run before release
    if (beforeRelease)
      logger.info(`\n[${green(pkgName)}] Running before release...`)

    if (typeof beforeRelease === 'string') {
      await run(beforeRelease, [])
    }
    else if (typeof beforeRelease === 'function') {
      await beforeRelease(pkgName, targetVersion)
    }
    else if (typeof beforeRelease === 'object') {
      const { command, cwd } = beforeRelease
      await run(command, [], { cwd })
    }

    logger.info(`\n[${green(pkgName)}] Updating package version...`)
    updateVersion(pkgPath, targetVersion)

    if (changelog) {
      logger.info(`\n[${green(pkgName)}] Generating changelog...`)
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
      logger.info(`\n[${green(pkgName)}] Committing changes...`)

      await runIfNotDry('git', ['add', '-A'])
      rb.add(async () => {
        await runIfNotDry('git', ['reset', 'HEAD'], { stdio: 'pipe' })
        logger.warn('Rollback: Cancel git add')
      })

      const commitMsg = `release: ${tag}${msg ? `\n\n${msg}` : ''}`
      await runIfNotDry('git', ['commit', '-m', commitMsg])
      rb.add(async () => {
        await runIfNotDry('git', ['reset', '--soft', 'HEAD^'])
        logger.warn(`[${green(pkgName)}] Rollback: Cancel git commit`)
      })

      await runIfNotDry('git', ['tag', tag])
      rb.add(async () => {
        await runIfNotDry('git', ['tag', '-d', tag], { stdio: 'pipe' })
        logger.warn(`[${green(pkgName)}] Rollback: Delete tag ${tag}`)
      })
    }
    else {
      logger.warn(`[${green(pkgName)}] No changes to commit.`)
      return
    }

    if (!autoPush) {
      logger.info(`
        [${green(pkgName)}] Release is done. You can push the changes to remote repository by running:
        ${yellow('git push')}
        ${yellow(`git push origin refs/tags/${tag}`)}
      `)
    }
    else {
      logger.info(`\n[${green(pkgName)}] Pushing...`)
      try {
        await runIfNotDry('git', ['push'])
      }
      catch (err) {
        logger.error(err)
        logger.break()
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
          logger.info(`
            [${green(pkgName)}] You can manually run:
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
          message: `[${green(pkgName)}] ${yellow('Push tag failed, rollback ?')}`,
        })

        if (yes) {
          logger.warn(`[${green(pkgName)}] You may need to manually rollback the commit on remote git:`)
          await logLastCommit()

          await rb.rollback()
          return
        }
        else {
          logger.info(`
           [${green(pkgName)}] You can manually run:
            ${yellow(`git push origin refs/tags/${tag}`)}
          `)

          return
        }
      }
    }

    if (isDryRun) {
      logger.info(`\n[${green(pkgName)}] Dry run finished - run git diff to see package changes.`)
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

      for (const selectedPkg of selectedPkgs) {
        await release({
          ...inlineConfig,
          specifiedPackage: selectedPkg,
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
