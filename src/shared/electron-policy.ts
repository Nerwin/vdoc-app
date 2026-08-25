export const SECURE_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
})

export function isTrustedRendererLocation(expectedUrl: string, actualUrl: string, packaged: boolean): boolean {
  try {
    const expected = new URL(expectedUrl)
    const actual = new URL(actualUrl)
    expected.hash = ''
    actual.hash = ''
    return packaged ? actual.href === expected.href : actual.origin === expected.origin
  } catch {
    return false
  }
}

export function isAllowedNavigation(currentUrl: string, targetUrl: string): boolean {
  return currentUrl === targetUrl
}
