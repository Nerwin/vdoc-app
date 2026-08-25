import { extractVersion } from './version.ts'

/** Release-owned CLI compatibility metadata from this app's package.json. */
export interface VdocCliRequirement {
  minimumVersion: string
  updateCommand?: string
  downloadUrl?: string
}

/** Parse only the public compatibility fields the renderer needs. */
export function parseVdocCliRequirement(packageJson: unknown): VdocCliRequirement | null {
  if (!packageJson || typeof packageJson !== 'object') return null
  const raw = (packageJson as { vdocCli?: unknown }).vdocCli
  if (!raw || typeof raw !== 'object') return null

  const candidate = raw as Record<string, unknown>
  if (typeof candidate.minimumVersion !== 'string') return null
  const minimumVersion = extractVersion(candidate.minimumVersion)
  if (!minimumVersion) return null

  const updateCommand = typeof candidate.updateCommand === 'string' && candidate.updateCommand.trim() !== ''
    ? candidate.updateCommand.trim()
    : undefined
  const downloadUrl = typeof candidate.downloadUrl === 'string' && /^https?:\/\//i.test(candidate.downloadUrl)
    ? candidate.downloadUrl
    : undefined

  return { minimumVersion, updateCommand, downloadUrl }
}
