/** Pure helpers turning a flat list of relative paths into a rendered tree. */

export interface TreeDir {
  kind: 'dir'
  path: string
  name: string
  depth: number
  children: TreeNode[]
}

export interface TreeLeaf {
  kind: 'file'
  path: string
  name: string
  depth: number
}

export type TreeNode = TreeDir | TreeLeaf

/** Build a nested tree from sorted relative paths ('dir/sub/foo.md'). */
export function buildTree(paths: string[]): TreeNode[] {
  const roots: TreeNode[] = []
  const dirs = new Map<string, TreeDir>()

  const dirFor = (dirPath: string, depth: number): TreeDir => {
    const existing = dirs.get(dirPath)
    if (existing) return existing
    const name = dirPath.split('/').at(-1) ?? dirPath
    const dir: TreeDir = { kind: 'dir', path: dirPath, name, depth, children: [] }
    dirs.set(dirPath, dir)
    const parent = dirPath.includes('/') ? dirFor(dirPath.slice(0, dirPath.lastIndexOf('/')), depth - 1) : undefined
    ;(parent ? parent.children : roots).push(dir)
    return dir
  }

  for (const path of [...paths].sort()) {
    const segments = path.split('/')
    const name = segments.at(-1) ?? path
    const depth = segments.length - 1
    const leaf: TreeLeaf = { kind: 'file', path, name, depth }
    if (segments.length === 1) roots.push(leaf)
    else dirFor(segments.slice(0, -1).join('/'), depth - 1).children.push(leaf)
  }

  return roots
}

/** Flatten the tree to the visible rows given a set of collapsed dir paths. */
export function flattenVisible(nodes: TreeNode[], collapsed: ReadonlySet<string>): TreeNode[] {
  const rows: TreeNode[] = []
  const walk = (list: TreeNode[]): void => {
    for (const node of list) {
      rows.push(node)
      if (node.kind === 'dir' && !collapsed.has(node.path)) walk(node.children)
    }
  }
  walk(nodes)
  return rows
}

/** All file paths under a node (a file yields itself). */
export function filesUnder(node: TreeNode): string[] {
  if (node.kind === 'file') return [node.path]
  return node.children.flatMap(filesUnder)
}

/** Stable re-order putting pinned paths first among their siblings, at every depth. */
export function orderPinnedFirst(nodes: TreeNode[], pinned: ReadonlySet<string>): TreeNode[] {
  if (pinned.size === 0) return nodes
  return [...nodes]
    .sort((a, b) => Number(pinned.has(b.path)) - Number(pinned.has(a.path)))
    .map(node => (node.kind === 'dir' ? { ...node, children: orderPinnedFirst(node.children, pinned) } : node))
}
