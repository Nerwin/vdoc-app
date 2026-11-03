import { useEffect, useId, useRef, useState } from 'react'

import type { CommentEntry } from '../../../shared/types.ts'
import { commentThreads, type CommentThread } from '../../../shared/comments.ts'
import { CloseIcon } from '../icons.tsx'

interface Props {
  path: string
  onError(error: unknown): void
}

export function CommentsView({ path, onError }: Props) {
  const [comments, setComments] = useState<CommentEntry[] | null>(null)
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<CommentEntry | null>(null)
  const [posting, setPosting] = useState(false)
  const composer = useRef<HTMLTextAreaElement>(null)
  const replyTarget = useId()

  const load = (): void => {
    setComments(null)
    setReplyTo(null)
    window.vdoc.comments(path)
      .then(setComments)
      .catch(error => {
        onError(error)
        setComments([])
      })
  }

  useEffect(load, [path]) // eslint-disable-line react-hooks/exhaustive-deps

  const reply = (comment: CommentEntry | null): void => {
    setReplyTo(comment)
    composer.current?.focus()
  }

  const post = (): void => {
    setPosting(true)
    window.vdoc.postComment(path, draft.trim(), replyTo?.id)
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
        {comments === null && <p className="text-[12px] text-ink-label">Loading comments…</p>}
        {comments?.length === 0 && <p className="text-[12px] text-ink-label">No comments on this page.</p>}
        <ul className="space-y-3">
          {comments && commentThreads(comments).map(thread => (
            <li key={thread.comment.id} className="rounded-md border border-line-subtle bg-pane px-3.5 py-2.5">
              <Comment thread={thread} disabled={posting} onReply={reply} />
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-line px-6 py-3">
        {replyTo && (
          <div id={replyTarget} className="mb-2 flex items-center gap-1.5 text-[11px] text-ink-label">
            <span className="shrink-0">Replying to <span className="text-ink">{replyTo.author}</span></span>
            <span className="min-w-0 truncate italic">{replyTo.markdown}</span>
            <button
              onClick={() => reply(null)}
              disabled={posting}
              title="Cancel reply"
              aria-label="Cancel reply"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-mute hover:bg-hover hover:text-ink"
            >
              <CloseIcon size={12} />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={composer}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            readOnly={posting}
            aria-label={replyTo ? 'Reply' : 'Footer comment'}
            aria-describedby={replyTo ? replyTarget : undefined}
            rows={2}
            placeholder={replyTo ? 'Reply (Markdown)…' : 'Add a footer comment (Markdown)…'}
            spellCheck={false}
            className="flex-1 resize-none rounded-md border border-line bg-well px-2.5 py-1.5 font-mono text-[12px] text-ink placeholder-ink-label outline-none focus:border-accent"
          />
          <button
            onClick={post}
            disabled={draft.trim() === '' || posting}
            className="rounded-md border border-primary-edge bg-primary px-3 py-1.5 text-[12px] text-primary-ink hover:bg-primary-hover disabled:opacity-40"
          >
            {posting ? 'Posting…' : replyTo ? 'Reply' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface CommentProps {
  thread: CommentThread
  nested?: boolean
  disabled: boolean
  onReply(comment: CommentEntry): void
}

function Comment({ thread: { comment, replies }, nested = false, disabled, onReply }: CommentProps) {
  return (
    <>
      <div className="mb-1 flex items-baseline gap-2 font-mono text-[11px]">
        <span className="text-ink">{comment.author}</span>
        <span className="text-ink-label">{comment.createdAt.slice(0, 10)}</span>
        {!nested && <span className={comment.kind === 'inline' ? 'text-warn-text' : 'text-ink-label'}>{comment.kind}</span>}
        {comment.resolutionStatus === 'resolved' && <span className="text-sync-text">resolved</span>}
        <button
          onClick={() => onReply(comment)}
          disabled={disabled}
          aria-label={`Reply to ${comment.author}`}
          className="ml-auto font-sans text-link hover:text-link-hover disabled:opacity-40"
        >
          Reply
        </button>
      </div>
      {!nested && comment.selection && (
        <blockquote className="mb-1.5 border-l-2 border-line pl-2 text-[11px] italic text-ink-label">
          {comment.selection}
        </blockquote>
      )}
      <p className="whitespace-pre-wrap text-[12px] text-ink-dim">{comment.markdown}</p>
      {replies.length > 0 && (
        <ul className="mt-2.5 space-y-2.5 border-l-2 border-line-subtle pl-3">
          {replies.map(reply => (
            <li key={reply.comment.id}>
              <Comment thread={reply} nested disabled={disabled} onReply={onReply} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
