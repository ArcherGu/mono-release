/**
 * modified from https://github.com/vuejs/core/blob/master/scripts/release.js
 */
import { existsSync, readdirSync, writeFileSync } from 'fs'
import path from 'path'
import colors from 'picocolors'
import type { Options as ExecaOptions } from 'execa'
import { execa } from 'execa'
import type { ReleaseType } from 'semver'
import semver from 'semver'
import fs from 'fs-extra'
import minimist from 'minimist'
import type { ResolvedReleaseConfig } from './config'

export const args = minimist(process.argv.slice(2))

export const isDryRun = !!args.dry // --dry

if (isDryRun) {
  console.log(colors.inverse(colors.yellow(' DRY RUN ')))
  console.log()
}

export async function getPackages(config: ResolvedReleaseConfig = {}) {
  const {
    cwd = process.cwd(),
    packagesPath = path.join(cwd, 'packages'),
    exclude = [],
  } = config

  if (!existsSync(packagesPath))
    throw new Error(`packages dir ${packagesPath} not found`)

  let packages = readdirSync(packagesPath)
  if (exclude.length > 0)
    packages = packages.filter(i => !exclude.includes(i))

  if (packages.length === 0)
    throw new Error(`no packages found in ${packagesPath}`)

  return packages
}

export function getPackageInfo(pkgName: string) {
  const pkgDir = path.resolve(__dirname, `../packages/${pkgName}`)

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

export async function run(
  bin: string,
  args: string[],
  opts: ExecaOptions<string> = {},
) {
  return execa(bin, args, { stdio: 'inherit', ...opts })
}

export async function dryRun(
  bin: string,
  args: string[],
  opts?: ExecaOptions<string>,
) {
  return console.log(
    colors.blue(`[dryrun] ${bin} ${args.join(' ')}`),
    opts || '',
  )
}

export const runIfNotDry = isDryRun ? dryRun : run

export function step(msg: string) {
  return console.log(colors.cyan(msg))
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

export function updateVersion(pkgPath: string, version: string): void {
  const pkg = fs.readJSONSync(pkgPath)
  pkg.version = version
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
}

export async function publishPackage(
  pkdDir: string,
  tag?: string,
): Promise<void> {
  const publicArgs = ['publish', '--access', 'public']
  if (tag)
    publicArgs.push('--tag', tag)

  await runIfNotDry('npm', publicArgs, {
    cwd: pkdDir,
  })
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

export async function logRecentCommits(pkgName: string) {
  const tag = await getLatestTag(pkgName)
  if (!tag)
    return
  const sha = await run('git', ['rev-list', '-n', '1', tag], {
    stdio: 'pipe',
  }).then(res => res.stdout.trim())
  console.log(
    colors.bold(
      `\n${colors.blue('i')} Commits of ${colors.green(
        pkgName,
      )} since ${colors.green(tag)} ${colors.gray(`(${sha.slice(0, 5)})`)}`,
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
      `packages/${pkgName}`,
    ],
    { stdio: 'inherit' },
  )
  console.log()
}
