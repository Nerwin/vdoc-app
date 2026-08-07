import { useEffect, useState } from 'react'

import type { CommentEntry } from '../../../shared/types.ts'

interface Props {
  path: string
  onError(error: unknown): void
}

export function CommentsView({ path, onError }: Props) {
  const [comments, setComments] = useState<CommentEntry[] | null>(null)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  const load = (): void => {
    setComments(null)
    window.vdoc.comments(path)
      .then(setComments)
      .catch(error => {
        onError(error)
        setComments([])
      })
  }

  useEffect(load, [path]) // eslint-disable-line react-hooks/exhaustive-deps

  const post = (): void => {
    setPosting(true)
    window.vdoc.postComment(path, draft.trim())
      .then(() => {
        setDraft('')
        load()
      })
      .catch(onError)
      .finally(() => setPosting(false))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {comments === null && <p className="text-[12px] text-ink-faint">Loading comments…</p>}
        {comments?.length === 0 && <p className="text-[12px] text-ink-faint">No comments on this page.</p>}
        <ul className="space-y-3">
          {comments?.map(comment => (
            <li key={comment.id} className="rounded-md border border-line-subtle bg-pane px-3.5 py-2.5">
              <div className="mb-1 flex items-baseline gap-2 font-mono text-[11px]">
                <span className="text-ink">{comment.author}</span>
                <span className="text-ink-faint">{comment.createdAt.slice(0, 10)}</span>
                <span className={comment.kind === 'inline' ? 'text-warn-text' : 'text-ink-faint'}>{comment.kind}</span>
                {comment.resolutionStatus === 'resolved' && <span className="text-sync-text">resolved</span>}
              </div>
              {comment.selection && (
                <blockquote className="mb-1.5 border-l-2 border-line pl-2 text-[11px] italic text-ink-faint">
                  {comment.selection}
                </blockquote>
              )}
              <p className="whitespace-pre-wrap text-[12px] text-ink-dim">{comment.markdown}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-end gap-2 border-t border-line px-6 py-3">
        <textarea
          value={draft}
          onChange={event => setDraft(event.target.value)}
          rows={2}
          placeholder="Add a footer comment (Markdown)…"
          spellCheck={false}
          className="flex-1 resize-none rounded-md border border-line bg-bg px-2.5 py-1.5 font-mono text-[12px] text-ink placeholder-ink-faint outline-none focus:border-accent"
        />
        <button
          onClick={post}
          disabled={draft.trim() === '' || posting}
          className="rounded-md bg-accent/80 px-3 py-1.5 text-[12px] text-white hover:bg-accent disabled:opacity-40"
        >
          {posting ? 'Posting…' : 'Comment'}
        </button>
      </div>
    </div>
  )
}
