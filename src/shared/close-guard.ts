type CloseRequest = 'close' | 'request-save' | 'wait'
type SaveCompletion = 'close' | 'confirm-discard' | 'ignore'
type DiscardCompletion = 'close' | 'keep-open' | 'ignore'

export class CloseGuardState {
  private state: 'idle' | 'waiting' | 'confirming' | 'approved' = 'idle'

  requestClose(): CloseRequest {
    if (this.state === 'approved') return 'close'
    if (this.state !== 'idle') return 'wait'
    this.state = 'waiting'
    return 'request-save'
  }

  completeSave(saved: boolean): SaveCompletion {
    if (this.state !== 'waiting') return 'ignore'
    this.state = saved ? 'approved' : 'confirming'
    return saved ? 'close' : 'confirm-discard'
  }

  completeDiscard(discard: boolean): DiscardCompletion {
    if (this.state !== 'confirming') return 'ignore'
    this.state = discard ? 'approved' : 'idle'
    return discard ? 'close' : 'keep-open'
  }
}
