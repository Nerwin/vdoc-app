import type { VdocCliRequirement } from '../../../shared/app-config.ts'
import { extractVersion } from '../../../shared/version.ts'

interface Props {
  currentVersion: string
  requirement: VdocCliRequirement
  onOpenSettings(): void
  onNotify(message: string): void
  onOpenExternal(url: string): void
}

/** Persistent and non-blocking: every action stays available while the CLI is outdated. */
export function CliVersionWarning(props: Props) {
  const current = extractVersion(props.currentVersion) ?? props.currentVersion

  const copyUpdateCommand = (): void => {
    if (!props.requirement.updateCommand) return
    void navigator.clipboard.writeText(props.requirement.updateCommand).then(
      () => props.onNotify('CLI update command copied'),
      () => props.onNotify(`Update the CLI with: ${props.requirement.updateCommand}`),
    )
  }

  return (
    <div
      role="alert"
      className="flex shrink-0 items-center gap-3 border-b border-banner-edge bg-banner-bg px-3.5 py-2 text-[11.5px] text-banner-ink"
    >
      <span className="shrink-0 text-[13px] text-banner-glyph">⚠</span>
      <p className="min-w-0 flex-1 leading-[1.45]">
        vdoc CLI <strong>v{current}</strong> is below the required <strong>v{props.requirement.minimumVersion}</strong>.
        {' '}The app remains usable, but actions may fail or behave incorrectly. Update to the latest CLI version.
      </p>
      {props.requirement.updateCommand && (
        <button
          onClick={copyUpdateCommand}
          title={props.requirement.updateCommand}
          className="shrink-0 rounded-md border border-banner-edge px-2.5 py-1 text-banner-ink hover:bg-hover"
        >
          Copy update command
        </button>
      )}
      {props.requirement.downloadUrl && (
        <button
          onClick={() => props.onOpenExternal(props.requirement.downloadUrl!)}
          className="shrink-0 rounded-md border border-banner-edge px-2.5 py-1 text-banner-ink hover:bg-hover"
        >
          Download latest
        </button>
      )}
      <button
        onClick={props.onOpenSettings}
        className="shrink-0 rounded-md px-2.5 py-1 text-banner-ink hover:bg-hover"
      >
        CLI settings
      </button>
    </div>
  )
}
