import type { CommentEntry } from './types.ts'

export interface CommentThread {
  comment: CommentEntry
  replies: CommentThread[]
}

/** Nests replies under their parent at any depth, keeping the CLI order; a reply whose parent is missing becomes a root. */
export function commentThreads(comments: CommentEntry[]): CommentThread[] {
  const threads = new Map(comments.map(comment => [comment.id, { comment, replies: [] as CommentThread[] }]))
  const roots: CommentThread[] = []
  for (const thread of threads.values()) {
    const parent = thread.comment.parentId ? threads.get(thread.comment.parentId) : undefined
    if (parent) parent.replies.push(thread)
    else roots.push(thread)
  }
  return roots
}
