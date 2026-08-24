import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
    const release = await response.json() as { tag_name?: string, html_url?: string }
    const version = String(release.tag_name ?? '').replace(/^v/, '')
    if (!version) return null
    return { version, url: release.html_url ?? `https://github.com/${owner}/${repo}/releases/latest` }
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

/** Newer release than the running app, or null. Throws on network failure (renderer decides silence). */
export async function checkUpdate(): Promise<UpdateInfo | null> {
  const source = updateSource()
  if (!source) return null
  const release = await source.provider.latestRelease(source.owner, source.repo)
  const current = app.getVersion()
  if (!release || !isNewerVersion(release.version, current)) return null
  return { current, latest: release.version, url: release.url }
}
