import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SessionEvent, SessionRecord, ZooworkClient } from '@zoowork-ai/sdk'
import { newState, STAGING_URL } from '../src/platform.js'
import { agentResource } from '../src/agent.js'
import { Conversations } from '../src/conversations.js'
import { Research } from '../src/turns.js'

export const urls = ['https://nodejs.org/en/about/previous-releases', 'https://github.com/nodejs/Release']
export const report = (title = 'Node.js 支持周期（模拟资料）') => `# ${title}\n\n## 摘要\n这是离线 fixture，用于验证研究流程，内容不是实时研究结果。\n\n## 主要发现\n选择版本时，应检查支持周期 [1](${urls[0]}) 和发布计划 [2](${urls[1]})。\n\n## 限制与待确认\n这里只提供模拟资料，实际版本需要重新查询。\n\n## 来源\n1. [Node.js 官方版本说明](${urls[0]})\n2. [Node.js 官方发布计划](${urls[1]})`
type Session = { record: SessionRecord; events: SessionEvent[]; notify: Set<() => void>; run?: string; turns: number }
export class FakePlatform {
  readonly state = newState({ apiKey: 'zwp_live_fixture_only', baseUrl: STAGING_URL }, 'research-assistant', agentResource())
  readonly sessions = new Map<string, Session>()
  readonly calls: { method: string; session?: string; key?: string; text?: string }[] = []
  readonly keys = new Map<string, string>()
  delay = 5
  dropStream = false
  ambiguousInput = false
  ambiguousCreate = false
  separateInboundIds = true
  pageSize = 500
  private timers = new Set<ReturnType<typeof setTimeout>>()
  constructor() { this.state.agentId = 'agent-fixture' }
  private session(id: string) { const session = this.sessions.get(id); if (!session) throw new Error('fixture_session_missing'); return session }
  emit(id: string, eventType: string, payload: Record<string, unknown>, runId?: string): SessionEvent {
    const s = this.session(id), seq = s.events.length + 1
    const e = { id: randomUUID(), seq, cursor: `fixture:${seq}`, eventType, payload, runId, createdAt: new Date().toISOString() }
    s.events.push(e); for (const wake of s.notify) wake(); return e
  }
  later(action: () => void) { const timer = setTimeout(() => { this.timers.delete(timer); action() }, this.delay); this.timers.add(timer) }
  close() { for (const timer of this.timers) clearTimeout(timer) }
  readonly client = {
    getAgent: async () => ({ agent_id: this.state.agentId, declared: this.state.resource, status: { desired_state: 'running' } }),
    createSession: async (_agent: string, body: { metadata: Record<string, string> }, key: string) => {
      this.calls.push({ method: 'create', key })
      const prior = this.keys.get(key); if (prior) return this.session(prior).record
      const id = randomUUID(), record = { session_id: id, metadata: body.metadata, run_status: 'idle', archived: false }
      this.keys.set(key, id); this.sessions.set(id, { record, events: [], notify: new Set(), turns: 0 })
      if (this.ambiguousCreate) { this.ambiguousCreate = false; throw new Error('fixture_lost_create_receipt') }
      return record
    },
    getSession: async (_agent: string, id: string) => ({ ...this.session(id).record }),
    listSessionPage: async () => ({ sessions: [...this.sessions.values()].map(s => s.record), next_cursor: null }),
    listEventsPage: async (_agent: string, id: string, options: { cursor?: string; limit?: number } = {}) => {
      const s = this.session(id), after = Number(options.cursor?.split(':')[1] ?? 0)
      const events = s.events.filter(e => e.seq > after).slice(0, Math.min(this.pageSize, options.limit ?? 500))
      const hasMore = (events.at(-1)?.seq ?? after) < s.events.length
      return { events: structuredClone(events), hasMore, nextCursor: hasMore ? `fixture:${events.at(-1)!.seq}` : undefined }
    },
    postEvents: async (_agent: string, id: string, events: { type: string; content?: string; idempotency_key?: string }[]) => {
      const s = this.session(id), input = events[0]
      this.calls.push({ method: input.type, session: id, key: input.idempotency_key, text: input.content })
      if (input.type === 'user.interrupt') {
        const accepted = !!s.run
        if (s.run) { this.emit(id, 'run.finished', { status: 'aborted' }, s.run); s.run = undefined; s.record.run_status = 'idle' }
        return { events: [{ id: randomUUID(), accepted }] }
      }
      const message = this.emit(id, 'user.message', { content: input.content })
      const run = randomUUID(); s.run = run; s.turns++; s.record.run_status = 'running'
      this.emit(id, 'run.started', { inboundMessageId: this.separateInboundIds ? randomUUID() : message.id, trigger: 'user_message', surface: 'api' }, run)
      this.emit(id, 'agent.assistant', { message: { content: [{ type: 'text', text: '正在检索和阅读资料（离线模拟）。' }] } }, run)
      this.later(() => {
        if (s.run !== run) return
        const search = randomUUID()
        this.emit(id, 'agent.tool', { phase: 'start', toolName: 'web_search', toolCallId: search, args: { query: input.content } }, run)
        this.emit(id, 'agent.tool', { phase: 'end', toolName: 'web_search', toolCallId: search, isError: false, resultPreview: urls.join('\n') }, run)
        urls.forEach(url => {
          const fetch = randomUUID()
          this.emit(id, 'agent.tool', { phase: 'start', toolName: 'web_fetch', toolCallId: fetch, args: { url } }, run)
          this.emit(id, 'agent.tool', { phase: 'end', toolName: 'web_fetch', toolCallId: fetch, isError: false, executionStarted: true }, run)
        })
        this.emit(id, 'agent.assistant', { message: { content: [{ type: 'text', text: report(s.turns === 1 ? undefined : '更新的研究简报（模拟资料）') }] } }, run)
        this.emit(id, 'run.finished', { status: 'succeeded' }, run); s.record.run_status = 'idle'; s.run = undefined
      })
      if (this.ambiguousInput) throw new Error('fixture_lost_input_receipt')
      return { events: [{ id: message.id, seq: message.seq, accepted: true }] }
    },
    streamEvents: (async function* (this: FakePlatform, _agent: string, id: string, options: { cursor?: string; signal?: AbortSignal } = {}) {
      if (this.dropStream) { this.dropStream = false; throw new Error('fixture_disconnected') }
      const s = this.session(id); let index = Number(options.cursor?.split(':')[1] ?? 0)
      while (!options.signal?.aborted) {
        while (index < s.events.length) yield structuredClone(s.events[index++])
        await new Promise<void>(resolve => {
          const wake = () => { s.notify.delete(wake); options.signal?.removeEventListener('abort', wake); resolve() }
          s.notify.add(wake); options.signal?.addEventListener('abort', wake, { once: true })
          if (options.signal?.aborted || index < s.events.length) wake()
        })
      }
    }).bind(this),
    deleteSession: async (_agent: string, id: string) => { this.calls.push({ method: 'delete-session', session: id }); this.sessions.delete(id) },
    stopAgent: async () => { this.calls.push({ method: 'stop' }); return { warnings: [] } },
    deleteAgent: async () => { this.calls.push({ method: 'delete' }) },
  } as unknown as ZooworkClient
}
export async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'research-assistant-fixture-')), platform = new FakePlatform()
  const store = new Conversations(join(directory, 'conversations'), platform.state, platform.client), research = new Research(store, 1500)
  return { directory, platform, store, research, close: async () => { platform.close(); await research.close(); await rm(directory, { recursive: true, force: true }) } }
}
