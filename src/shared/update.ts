import type { AppUpdateStatus } from './types.ts'

export function updateCheckMessage(status: AppUpdateStatus): string {
  switch (status.phase) {
    case 'available':
    case 'downloading':
      return status.latest
        ? `V-DOC ${status.latest} is available and downloading`
        : 'A V-DOC update is downloading'
    case 'downloaded':
      return status.latest
        ? `V-DOC ${status.latest} is ready to install`
        : 'A V-DOC update is ready to install'
    case 'manual':
      return status.latest
        ? `V-DOC ${status.latest} requires a manual download`
        : 'This update requires a manual download'
    case 'error':
      return 'Unable to check for updates'
    case 'unsupported':
      return 'Automatic updates are available in packaged builds'
    case 'checking':
      return 'Checking for updates'
    case 'idle':
    case 'current':
      return 'V-DOC is up to date'
  }
}

export function macBundlePath(executablePath: string): string | null {
  const marker = '.app/Contents/MacOS/'
  const index = executablePath.lastIndexOf(marker)
  return index < 0 ? null : executablePath.slice(0, index + '.app'.length)
}
