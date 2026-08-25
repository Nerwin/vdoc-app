/** User-facing result for one `vdoc md init` file entry. */
export function initMessage(path: string, added: string[]): string {
  const name = path.split('/').at(-1) ?? path
  return added.length > 0
    ? `Initialized ${name}: added ${added.join(', ')}`
    : `Nothing to add to ${name}`
}
