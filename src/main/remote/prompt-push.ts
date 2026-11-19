// The phone's prompt list, pushed once per change and never out of order (PRD F22). Building the list awaits a "is this
// held" answer per hook prompt, so two calls can overlap: the older one may resolve after the newer one, and if it were
// sent last a prompt the desktop answered a moment ago would come back as answerable. Pure: no Electron, no Node.

/** Pushes a freshly built value: the newest build started wins, and the same value as last time is not pushed again. */
export class PromptPusher<T> {
  private started = 0
  private sent: string | null = null

  constructor(
    private readonly send: (value: T) => void,
    private readonly key: (value: T) => string = (value) => JSON.stringify(value)
  ) {}

  /** Builds it, then pushes it unless a newer build started meanwhile (or it equals the last value pushed). */
  async push(build: () => Promise<T>): Promise<void> {
    const run = ++this.started
    const value = await build()
    if (run !== this.started) return
    const key = this.key(value)
    if (key === this.sent) return
    this.sent = key
    this.send(value)
  }

  /** Nothing stands between phones any more (another server, or none): the next list goes out whatever it says. */
  reset(): void {
    this.sent = null
  }
}
