import { toolCall, type SessionEvent, type ZooworkClient } from '@zoowork-ai/sdk'
import { safeError } from './platform.js'

type Summary = Record<string, string | number | boolean | string[]>
export interface SdkCallView {
  id: number; method: string; startedAt: string; durationMs: number
  status: 'running' | 'succeeded' | 'failed' | 'closed'
  agentId?: string; sessionId?: string; conversationId?: string
  params: Summary; result?: Summary; error?: string; received?: number
}
export interface DebugEventView {
  sessionId: string; seq: number; type: string; runId?: string
  tool?: string; phase?: string; outcome?: string; sources: ('history' | 'stream')[]
}
export interface DebugView {
  startedAt: string; fixture: boolean; agentId: string; sessionId?: string
  calls: SdkCallView[]; events: DebugEventView[]; active: number
}
const methods = new Set(['getAgent', 'getSession', 'createSession', 'postEvents', 'listEventsPage', 'streamEvents', 'listSessionPage', 'deleteSession', 'stopAgent', 'deleteAgent'])
const reads = new Set(['getAgent', 'getSession', 'listEventsPage', 'listSessionPage'])
const statuses = new Set(['idle', 'running', 'queued', 'succeeded', 'failed', 'aborted', 'awaiting_approval', 'stopped'])
const eventTypes = new Set(['user.message', 'user.interrupt', 'run.started', 'run.finished', 'run.failed', 'run.aborted', 'agent.assistant', 'agent.tool', 'agent.error'])
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' ? v as Record<string, unknown> : {}
const id = (v: unknown): string | undefined => typeof v === 'string' && !v.startsWith('zwp_live_') && /^[a-zA-Z0-9_-]{8,128}$/.test(v) ? v : undefined
const state = (v: unknown): string => typeof v === 'string' && statuses.has(v) ? v : 'unknown'
const eventType = (v: unknown): string => typeof v === 'string' && eventTypes.has(v) ? v : 'other'

// An allow list is intentional: never retain raw arguments, headers, messages, tool
// output, cursors, metadata or SDK errors. The browser gets only this projection.
export class SdkDebug {
  readonly startedAt = new Date().toISOString()
  private next = 0
  private calls: (SdkCallView & { clock: number })[] = []
  private events = new Map<string, DebugEventView>()
  begin(method: string, args: unknown[]): SdkCallView & { clock: number } {
    const params: Summary = {}, agentId = id(args[0])
    const sessionId = ['getSession', 'postEvents', 'listEventsPage', 'streamEvents', 'deleteSession'].includes(method) ? id(args[1]) : undefined
    if (agentId) params.agentId = agentId
    if (sessionId) params.sessionId = sessionId
    const options = object(args[sessionId ? 2 : 1])
    if (['listEventsPage', 'streamEvents', 'listSessionPage'].includes(method)) params.resumeCursor = typeof options.cursor === 'string'
    if (method === 'listEventsPage' && typeof options.limit === 'number') params.limit = options.limit
    if (method === 'createSession') params.idempotency = typeof args[2] === 'string'
    if (method === 'postEvents' && Array.isArray(args[2])) {
      const inputs = args[2].map(object)
      params.types = inputs.map(v => eventType(v.type))
      params.eventCount = inputs.length
      params.contentCharacters = inputs.reduce((n, v) => n + (typeof v.content === 'string' ? v.content.length : 0), 0)
      params.idempotency = inputs.some(v => typeof v.idempotency_key === 'string')
    }
    const call = { id: ++this.next, method, params, agentId, sessionId,
      conversationId: method === 'createSession' ? id(object(object(args[1]).metadata).conversation_id) : undefined,
      startedAt: new Date().toISOString(), durationMs: 0, status: 'running' as const, clock: performance.now() }
    this.calls.push(call)
    while (this.calls.length > 160) {
      const read = this.calls.findIndex(c => c.status !== 'running' && reads.has(c.method))
      const completed = read >= 0 ? read : this.calls.findIndex(c => c.status !== 'running')
      this.calls.splice(completed >= 0 ? completed : 0, 1)
    }
    return call
  }
  finish(call: SdkCallView, status: SdkCallView['status'], value?: unknown, error?: unknown): void {
    call.status = status
    call.durationMs = Math.round(performance.now() - (call as SdkCallView & { clock: number }).clock)
    if (error !== undefined) call.error = safeError(error)
    const result = object(value), summary: Summary = {}
    if (call.method === 'createSession') {
      call.sessionId = id(result.session_id)
      if (call.sessionId) summary.sessionId = call.sessionId
    }
    if (call.method === 'getAgent') summary.desiredState = state(object(result.status).desired_state)
    if (call.method === 'getSession') { summary.runStatus = state(result.run_status); summary.archived = result.archived === true }
    if (call.method === 'postEvents' && Array.isArray(result.events)) {
      summary.receipts = result.events.length
      summary.accepted = result.events.filter(v => object(v).accepted === true).length
      summary.rejected = result.events.filter(v => object(v).accepted === false).length
    }
    if (call.method === 'listEventsPage' && Array.isArray(result.events)) {
      summary.events = result.events.length; summary.hasMore = result.hasMore === true
      if (call.sessionId) for (const event of result.events) this.event(call.sessionId, event as SessionEvent, 'history')
    }
    if (call.method === 'listSessionPage' && Array.isArray(result.sessions)) summary.sessions = result.sessions.length
    if (Object.keys(summary).length) call.result = summary
  }
  event(sessionId: string, event: SessionEvent, source: 'history' | 'stream'): void {
    if (!Number.isSafeInteger(event.seq) || event.seq < 0) return
    const key = `${sessionId}:${event.seq}`, prior = this.events.get(key)
    if (prior) { if (!prior.sources.includes(source)) prior.sources.push(source); return }
    const t = toolCall(event), phase = t?.phase
    this.events.set(key, { sessionId, seq: event.seq, type: eventType(event.eventType), runId: id(event.runId),
      ...(t ? { tool: ['web_search', 'web_fetch'].includes(t.toolName) ? t.toolName : 'other',
        phase: ['start', 'end', 'blocked'].includes(phase ?? '') ? phase : 'other' } : {}),
      ...(event.eventType.startsWith('run.') && event.payload.status ? { outcome: state(event.payload.status) } : {}), sources: [source] })
    if (this.events.size > 200) this.events.delete(this.events.keys().next().value!)
  }
  snapshot(agentId: string, fixture: boolean, sessionId?: string, conversationId?: string): DebugView {
    const calls = this.calls.filter(c => !conversationId || c.sessionId === sessionId || c.conversationId === conversationId ||
      (!c.sessionId && !c.conversationId && c.method !== 'createSession')).map(({ clock, ...call }) => ({ ...call,
        params: { ...call.params }, result: call.result ? { ...call.result } : undefined,
        durationMs: call.status === 'running' ? Math.round(performance.now() - clock) : call.durationMs }))
    return { startedAt: this.startedAt, fixture, agentId, sessionId, calls,
      events: [...this.events.values()].filter(e => !conversationId || e.sessionId === sessionId).map(e => ({ ...e, sources: [...e.sources] })),
      active: calls.filter(c => c.status === 'running').length }
  }
}

export function traceClient(client: ZooworkClient, debug: SdkDebug): ZooworkClient {
  return new Proxy(client, { get(target, property, receiver) {
    const fn: unknown = Reflect.get(target, property, receiver)
    if (typeof property !== 'string' || !methods.has(property) || typeof fn !== 'function') return fn
    if (property === 'streamEvents') return async function* (...args: unknown[]) {
      const call = debug.begin(property, args); call.received = 0
      try {
        const stream = Reflect.apply(fn, target, args) as AsyncIterable<SessionEvent>
        for await (const event of stream) {
          call.received++
          if (call.sessionId) debug.event(call.sessionId, event, 'stream')
          yield event
        }
        debug.finish(call, 'succeeded')
      } catch (error) { debug.finish(call, 'failed', undefined, error); throw error }
      finally { if (call.status === 'running') debug.finish(call, 'closed') }
    }
    return async (...args: unknown[]) => {
      const call = debug.begin(property, args)
      try { const result: unknown = await Reflect.apply(fn, target, args); debug.finish(call, 'succeeded', result); return result }
      catch (error) { debug.finish(call, 'failed', undefined, error); throw error }
    }
  } })
}
