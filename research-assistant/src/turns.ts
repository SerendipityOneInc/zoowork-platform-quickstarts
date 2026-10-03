import { assistantText, messageText, runOutcome, ZooworkError, type SessionEvent, type ZooworkClient } from '@zoowork-ai/sdk'
import { project, type ResearchView } from './brief.js'
import { Conversations, digest, validId, type Conversation, type InputIntent } from './conversations.js'
import { FoundationError, safeError } from './platform.js'

export async function allEvents(client: ZooworkClient, agent: string, session: string): Promise<SessionEvent[]> {
  const events = new Map<number, SessionEvent>()
  let cursor: string | undefined
  do {
    const page = await client.listEventsPage(agent, session, { cursor, limit: 500 })
    for (const e of page.events) if (e.seq >= 0) events.set(e.seq, e)
    if (!page.hasMore) {
      if (page.hasMore === undefined && page.events.length >= 500) throw new FoundationError('history_pagination_unavailable')
      break
    }
    if (!page.nextCursor || page.nextCursor === cursor) throw new FoundationError('non_advancing_cursor')
    cursor = page.nextCursor
  } while (cursor)
  return [...events.values()].sort((a, b) => a.seq - b.seq)
}
type Listener = (event?: SessionEvent) => void
export class Research {
  private shutdown = new AbortController()
  private readers = new Map<string, Promise<void>>()
  private listeners = new Map<string, Set<Listener>>()
  private cached = new Map<string, SessionEvent[]>()
  constructor(readonly store: Conversations, readonly budgetMs = 600_000) {}
  async close(): Promise<void> {
    this.shutdown.abort()
    await Promise.allSettled(this.readers.values())
    await this.store.serial(async () => {})
    this.listeners.clear(); this.cached.clear()
  }
  subscribe(id: string, listener: Listener): () => void {
    const set = this.listeners.get(id) ?? new Set<Listener>(); set.add(listener); this.listeners.set(id, set)
    return () => { set.delete(listener); if (!set.size) this.listeners.delete(id) }
  }
  private notify(id: string, event?: SessionEvent) {
    for (const fn of this.listeners.get(id) ?? []) { try { fn(event) } catch {} }
  }
  async history(id: string): Promise<ResearchView & { title: string; archived: boolean }> {
    const { record } = await this.store.owned(id)
    const events = await allEvents(this.store.client, record.agentId, record.sessionId!)
    if (!this.readers.has(id)) this.cached.set(id, events)
    const session = await this.store.client.getSession(record.agentId, record.sessionId!)
    const view = project(events, session.run_status)
    if (record.activeInput && !view.status.match(/running|queued|awaiting/)) {
      const input = record.inputs[record.activeInput]
      if (!input.outcome) view.status = 'uncertain'
    }
    const latestInput = Object.values(record.inputs).at(-1)
    if (latestInput?.outcome === 'rejected') { view.status = 'failed'; view.problem = latestInput.errorCode ?? 'input_not_accepted' }
    return { ...view, title: record.title, archived: session.archived === true }
  }
  snapshot(id: string): ResearchView { return project(this.cached.get(id) ?? []) }
  private async ingest(id: string, event: SessionEvent, notify = true): Promise<void> {
    const list = this.cached.get(id) ?? []
    if (list.some(e => e.seq === event.seq)) return
    list.push(event); this.cached.set(id, list)
    await this.store.serial(async () => {
      const c = await this.store.read(id), input = c.activeInput ? c.inputs[c.activeInput] : undefined
      c.cursor = event.cursor ?? c.cursor
      if (input) {
        const echo = list.find(e => e.eventType === 'user.message' && e.seq > input.baseline &&
          digest(messageText({ content: e.payload.content })) === input.hash)
        if (echo) { input.eventId ??= echo.id; input.seq = echo.seq }
        const starts = list.filter(e => e.eventType === 'run.started' && e.seq > input.baseline && e.runId)
        const anchored = starts.find(e => input.eventId && [e.payload.inboundMessageId, e.payload.originEventId].includes(input.eventId))
        // Deployed API receipts identify the public ledger row, while inboundMessageId identifies
        // the internal ingress row. They are different UUIDs. Under this app's single-writer
        // contract, a matching input echo + exactly one new external run is sufficient.
        const external = starts.filter(e => (e.payload.trigger === undefined || ['api', 'user_message'].includes(String(e.payload.trigger))) &&
          (e.payload.surface === undefined || ['api', 'web'].includes(String(e.payload.surface))))
        if (!input.runId) input.runId = anchored?.runId ?? (echo && external.length === 1 ? external[0].runId : undefined)
        const terminal = list.find(e => e.runId === input.runId && runOutcome(e))
        const outcome = terminal && runOutcome(terminal)
        if (outcome) {
          input.outcome = outcome; delete input.text; delete c.activeInput
        }
      }
      c.status = project(list).status
      if (event.seq > (c.lastSeq ?? -1)) {
        c.lastSeq = event.seq
        c.updatedAt = event.createdAt && Number.isFinite(Date.parse(event.createdAt)) ? new Date(event.createdAt).toISOString() : new Date().toISOString()
      }
      await this.store.save(c, false)
    })
    if (notify) this.notify(id, event)
  }
  observe(id: string): Promise<void> {
    const current = this.readers.get(id); if (current) return current
    const promise = this.pump(id).finally(() => { this.readers.delete(id); this.notify(id) })
    this.readers.set(id, promise)
    return promise
  }
  private async pump(id: string): Promise<void> {
    const { record } = await this.store.owned(id)
    const original = await allEvents(this.store.client, record.agentId, record.sessionId!)
    // Replay from durable history before streaming; this also recovers accepted inputs after a crash.
    this.cached.set(id, [])
    for (const e of original) await this.ingest(id, e)
    let c = await this.store.read(id)
    const session = await this.store.client.getSession(c.agentId, c.sessionId!)
    if (!c.activeInput && !['running', 'awaiting_approval'].includes(session.run_status ?? '')) return
    const signal = AbortSignal.any([AbortSignal.timeout(this.budgetMs), this.shutdown.signal])
    let cursor = c.cursor, attempts = 0
    while (!signal.aborted && attempts++ < 4) {
      try {
        for await (const e of this.store.client.streamEvents(c.agentId, c.sessionId!, { cursor, signal })) {
          cursor = e.cursor ?? cursor; await this.ingest(id, e)
          c = await this.store.read(id)
          if (!c.activeInput && runOutcome(e)) return
        }
      } catch (error) {
        if (signal.aborted) break
        if (typeof error === 'object' && error && 'status' in error && Number(error.status) < 500) break
      }
      // Read-only recovery. Never post a second user message to recover an observer.
      const latest = await allEvents(this.store.client, c.agentId, c.sessionId!)
      for (const e of latest) await this.ingest(id, e)
      c = await this.store.read(id)
      if (!c.activeInput && project(latest).status !== 'running') return
      await new Promise<void>(resolve => { const t = setTimeout(resolve, Math.min(attempts * 500, 2000)); signal.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true }) })
    }
    this.notify(id)
  }
  async send(id: string, text: string, requestId: string, post: (text: string) => Promise<unknown>): Promise<void> {
    if (!validId(requestId) || !text.trim() || text.length > 12_000) throw new FoundationError('invalid_input')
    await this.store.serial(async () => {
      const { record: c, session } = await this.store.owned(id)
      if (session.archived) throw new FoundationError('session_archived')
      const existing = c.inputs[requestId]
      if (existing && existing.hash !== digest(text)) throw new FoundationError('request_content_conflict')
      if (existing) return // Same intent is observed, never automatically re-posted.
      if (c.activeInput || ['running', 'awaiting_approval'].includes(session.run_status ?? '')) throw new FoundationError('research_busy')
      const events = await allEvents(this.store.client, c.agentId, c.sessionId!)
      const input: InputIntent = { key: `research:${c.instance}:${c.id}:${requestId}`, hash: digest(text), text,
        baseline: events.at(-1)?.seq ?? -1 }
      c.inputs[requestId] = input; c.activeInput = requestId; c.status = 'queued'; await this.store.save(c)
      let receipt
      try { receipt = await this.store.client.postEvents(c.agentId, c.sessionId!, [
        { type: 'user.message', content: text, idempotency_key: input.key },
      ]) } catch (error) {
        if (error instanceof ZooworkError && [400, 401, 402, 403, 404, 422, 429].includes(error.status)) {
          input.outcome = 'rejected'; input.errorCode = safeError(error); delete input.text; delete c.activeInput; c.status = 'failed'; await this.store.save(c)
        }
        throw error
      }
      const accepted = receipt.events[0]
      if (!accepted || accepted.accepted === false) {
        input.outcome = 'rejected'; input.errorCode = 'input_not_accepted'; delete input.text; delete c.activeInput; c.status = 'failed'; await this.store.save(c)
        throw new FoundationError('input_not_accepted')
      }
      if (typeof accepted.id === 'string') input.eventId = accepted.id
      if (typeof accepted.seq === 'number') input.seq = accepted.seq
      await this.store.save(c)
    })
    const delivered = new Set<number>()
    let delivery: Promise<unknown> = Promise.resolve()
    const receive = (e?: SessionEvent) => {
      if (!e || e.eventType !== 'agent.assistant' || delivered.has(e.seq)) return
      delivery = delivery.then(async () => {
        const c = await this.store.read(id), intent = c.inputs[requestId]
        if (intent.runId !== e.runId) return
        delivered.add(e.seq)
        const text = assistantText(e)
        if (text.trim()) await post(text).catch(() => {}) // Browser disconnect does not cancel research.
      })
    }
    const unsubscribe = this.subscribe(id, receive)
    for (const e of this.cached.get(id) ?? []) receive(e)
    try { await this.observe(id); for (const e of this.cached.get(id) ?? []) receive(e); await delivery }
    finally { unsubscribe() }
  }
  async interrupt(id: string): Promise<boolean> {
    const { record, session } = await this.store.owned(id)
    if (session.archived) throw new FoundationError('session_archived')
    const receipt = await this.store.client.postEvents(record.agentId, record.sessionId!, [{ type: 'user.interrupt' }])
    void this.observe(id).catch(() => {})
    return receipt.events[0]?.accepted === true
  }
}
