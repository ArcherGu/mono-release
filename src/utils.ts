/**
 * Modified from https://github.com/vuejs/core/blob/master/scripts/release.js
 */
import { existsSync, readdirSync, writeFileSync } from 'fs'
import path from 'path'
import { blue, bold, gray, green, inverse } from 'colorette'
import type { Options as ExecaOptions } from 'execa'
import { execa } from 'execa'
import type { ReleaseType } from 'semver'
import semver from 'semver'
import fs from 'fs-extra'
import { createLogger } from './log'

const logger = createLogger()

export async function getPackages(packagesPath: string, exclude: string[] = []) {
  if (!existsSync(packagesPath))
    throw new Error(`Packages dir ${packagesPath} not found`)

  const packages = readdirSync(packagesPath).filter((i) => {
    if (
      fs.statSync(path.join(packagesPath, i)).isDirectory()
      && !exclude.includes(i)
    )
      return true

    return false
  })

  if (packages.length === 0)
    throw new Error(`No packages found in ${packagesPath}`)

  return packages
}

export function getPackageInfo(pkgName: string, packagesPath: string) {
  const pkgDir = path.resolve(packagesPath, pkgName)

  if (!existsSync(pkgDir))
    throw new Error(`Package ${pkgName} not found`)

  const pkgPath = path.resolve(pkgDir, 'package.json')

  const pkg: {
    name: string
    version: string
    private?: boolean
    // eslint-disable-next-line @typescript-eslint/no-var-requires
  } = require(pkgPath)
  const currentVersion = pkg.version

  if (pkg.private)
    throw new Error(`Package ${pkgName} is private`)

  return {
    pkg,
    pkgName,
    pkgDir,
    pkgPath,
    currentVersion,
  }
}

async function run(
  bin: string,
  args: string[],
  opts: ExecaOptions<string> = {},
) {
  return execa(bin, args, { stdio: 'inherit', ...opts })
}

async function dryRun(
  bin: string,
  args: string[],
  opts?: ExecaOptions<string>,
) {
  return logger.info(
    `[dryrun] ${bin} ${args.join(' ')}`,
    opts || '',
  )
}

export function getRunner(isDryRun: boolean) {
  if (isDryRun) {
    logger.warn(inverse(' DRY RUN '))
    logger.break()
  }

  return {
    run,
    dryRun,
    runIfNotDry: isDryRun ? dryRun : run,
  }
}

export function getVersionChoices(currentVersion: string) {
  const currentBeta = currentVersion.includes('beta')
  const currentAlpha = currentVersion.includes('alpha')
  const isStable = !currentBeta && !currentAlpha

  function inc(i: ReleaseType, tag = currentAlpha ? 'alpha' : 'beta') {
    return semver.inc(currentVersion, i, tag)!
  }

  let versionChoices = [
    {
      title: 'next',
      value: inc(isStable ? 'patch' : 'prerelease'),
    },
  ]

  if (isStable) {
    versionChoices.push(
      {
        title: 'beta-minor',
        value: inc('preminor'),
      },
      {
        title: 'beta-major',
        value: inc('premajor'),
      },
      {
        title: 'alpha-minor',
        value: inc('preminor', 'alpha'),
      },
      {
        title: 'alpha-major',
        value: inc('premajor', 'alpha'),
      },
      {
        title: 'minor',
        value: inc('minor'),
      },
      {
        title: 'major',
        value: inc('major'),
      },
    )
  }
  else if (currentAlpha) {
    versionChoices.push({
      title: 'beta',
      value: `${inc('patch')}-beta.0`,
    })
  }
  else {
    versionChoices.push({
      title: 'stable',
      value: inc('patch'),
    })
  }
  versionChoices.push({ value: 'custom', title: 'custom' })

  versionChoices = versionChoices.map((i) => {
    i.title = `${i.title} (${i.value})`
    return i
  })

  return versionChoices
}

export function updateVersion(pkgPath: string, version: string) {
  const pkg = fs.readJSONSync(pkgPath)
  pkg.version = version
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
}

export async function getLatestTag(pkgName: string) {
  const tags = (await run('git', ['tag'], { stdio: 'pipe' })).stdout
    .split(/\n/)
    .filter(Boolean)
  const prefix = `${pkgName}@`
  return tags
    .filter(tag => tag.startsWith(prefix))
    .sort()
    .reverse()[0]
}

export async function logRecentCommits(pkgName: string, pkgPath: string) {
  const tag = await getLatestTag(pkgName)
  if (!tag)
    return
  const sha = await run('git', ['rev-list', '-n', '1', tag], {
    stdio: 'pipe',
  }).then(res => res.stdout.trim())
  logger.log(
    bold(
      `\n${inverse(blue(' i '))} Commits of ${green(
        pkgName,
      )} since ${green(tag)} ${gray(`(${sha.slice(0, 5)})`)}`,
    ),
  )
  await run(
    'git',
    [
      '--no-pager',
      'log',
      `${sha}..HEAD`,
      '--oneline',
      '--',
      `${path.resolve(pkgPath, pkgName)}`,
    ],
    { stdio: 'inherit' },
  )
  logger.break()
}

export async function logLastCommit() {
  await run(
    'git',
    [
      '--no-pager',
      'log',
      '--oneline',
      '-1',
    ],
    { stdio: 'inherit' },
  )
  logger.break()
}

export async function branchCheck(branch: string) {
  const { stdout: currentBranch } = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { stdio: 'pipe' })
  return currentBranch === branch
}
