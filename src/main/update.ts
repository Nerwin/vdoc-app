import { spawn } from 'node:child_process'
import { createWriteStream, readFileSync } from 'node:fs'
import { mkdtemp, readdir, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'
import { app, net } from 'electron'

import type { UpdateInfo } from '../shared/types.ts'
import { isNewerVersion } from '../shared/version.ts'

/**
 * Update feed: the latest published release of this app's own repository.
 * The repository comes from package.json `repository.url` (no name lives in
 * code), and the matching forge adapter is picked by the URL's host.
 */

interface Release {
  /** Version without a leading v. */
  version: string
  /** Human release page - where the installers are attached. */
  url: string
  /** Downloadable installers attached to the release. */
  assets: Array<{ name: string, url: string }>
}

/** One hosted forge's release API. Adding GitLab/Bitbucket = one more entry in PROVIDERS. */
interface ReleaseProvider {
  /** Hostname this adapter serves, matched against the repository URL. */
  host: string
  /** Latest published release visible to an unauthenticated client, or null. */
  latestRelease(owner: string, repo: string): Promise<Release | null>
}

const github: ReleaseProvider = {
  host: 'github.com',
  async latestRelease(owner, repo) {
    const response = await net.fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    // 404 = nothing published (a private repo hides everything); rate limits etc. also mean "nothing to offer".
    if (!response.ok) return null
    const release = await response.json() as {
      tag_name?: string
      html_url?: string
      assets?: Array<{ name?: string, browser_download_url?: string }>
    }
    const version = String(release.tag_name ?? '').replace(/^v/, '')
    if (!version) return null
    return {
      version,
      url: release.html_url ?? `https://github.com/${owner}/${repo}/releases/latest`,
      assets: (release.assets ?? []).flatMap(asset =>
        asset.name && asset.browser_download_url ? [{ name: asset.name, url: asset.browser_download_url }] : []),
    }
  },
}

const PROVIDERS: ReleaseProvider[] = [github]

/** package.json `repository` resolved to an adapter + owner/repo, or null when absent/unrecognized. */
function updateSource(): { provider: ReleaseProvider, owner: string, repo: string } | null {
  try {
    const pkg = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as {
      repository?: string | { url?: string }
    }
    const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
    if (!raw) return null
    const url = new URL(raw.replace(/^git\+/, ''))
    const [owner, repo] = url.pathname.replace(/^\/|\.git$/g, '').split('/')
    const provider = PROVIDERS.find(candidate => candidate.host === url.hostname)
    return provider && owner && repo ? { provider, owner, repo } : null
  } catch {
    return null
  }
}

/** The running .app bundle path - only set when launched from a real bundle on macOS. */
const macBundle = (): string | undefined => process.execPath.match(/^(.+?\.app)\//)?.[1]

/** In-app install works on macOS only: the release zip is unpacked and swapped over the bundle. */
function installableAsset(release: Release): string | undefined {
  if (process.platform !== 'darwin' || !macBundle()) return undefined
  return release.assets.find(asset => asset.name.endsWith(`-mac-${process.arch}.zip`))?.url
}

/** Newer release than the running app, or null. Throws on network failure (renderer decides silence). */
export async function checkUpdate(): Promise<UpdateInfo | null> {
  const source = updateSource()
  if (!source) return null
  const release = await source.provider.latestRelease(source.owner, source.repo)
  const current = app.getVersion()
  if (!release || !isNewerVersion(release.version, current)) return null
  return { current, latest: release.version, url: release.url, assetUrl: installableAsset(release) }
}

const run = (command: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' })
    child.on('error', reject)
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))))
  })

/**
 * Download the release zip, swap it over the running bundle, relaunch.
 * ditto (not a JS unzip) keeps the bundle's symlinks and permissions intact.
 * The old bundle is kept in the temp dir and restored if the swap fails.
 */
export async function installUpdate(assetUrl: string): Promise<void> {
  const bundle = macBundle()
  if (!bundle) throw new Error('In-app install only works from the installed macOS app')
  const workDir = await mkdtemp(join(tmpdir(), 'vdoc-update-'))
  const zip = join(workDir, 'update.zip')
  const response = await net.fetch(assetUrl)
  if (!response.ok || !response.body) throw new Error(`Download failed (HTTP ${response.status})`)
  await pipeline(Readable.fromWeb(response.body as NodeReadableStream), createWriteStream(zip))
  const unpacked = join(workDir, 'unpacked')
  await run('ditto', ['-xk', zip, unpacked])
  const fresh = (await readdir(unpacked)).find(name => name.endsWith('.app'))
  if (!fresh) throw new Error('No app bundle inside the release archive')
  await rename(bundle, join(workDir, 'previous.app'))
  try {
    await rename(join(unpacked, fresh), bundle)
  } catch (error) {
    await rename(join(workDir, 'previous.app'), bundle)
    throw error
  }
  app.relaunch()
  app.quit()
}
