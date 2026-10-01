// Reading/progress structure adapted from Anthropic's MIT Chat SDK quickstart.
// Source commit and paths: ../REFERENCES.md; license: ../third-party/anthropic-MIT.txt.
import { assistantText, messageText, runOutcome, toolCall, type SessionEvent } from '@zoowork-ai/sdk'

export interface MessageView { id: string; role: 'user' | 'assistant'; text: string }
export interface ToolView { id: string; runId?: string; name: string; hint: string; url?: string; phase: string; error: boolean; seq: number; executed: boolean }
export interface SourceView { title: string; url: string; state: 'read' | 'earlier' | 'search' | 'unverified' }
export interface BriefView { id: string; runId: string; markdown: string; sources: SourceView[]; ready: boolean; date?: string }
export interface ResearchView {
  messages: MessageView[]; tools: ToolView[]; briefs: BriefView[]
  status: string; lastSeq: number; cursor?: string; runId?: string; searches: number; fetches: number; problem?: string
}
export function safeUrl(value: string): string | undefined {
  try {
    const u = new URL(value)
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return
    u.hash = ''
    return u.toString()
  } catch { return }
}
export function sourcesOf(markdown: string): SourceView[] {
  const section = markdown.split(/^##\s+(?:来源|Sources|References)\s*$/im)[1]
  if (!section) return []
  const sources = new Map<string, SourceView>()
  for (const match of section.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g)) {
    const url = safeUrl(match[2])
    if (url && !sources.has(url)) sources.set(url, { title: match[1].slice(0, 300), url, state: 'unverified' })
  }
  return [...sources.values()]
}
export function project(events: SessionEvent[], sessionStatus?: string | null): ResearchView {
  const sorted = [...new Map(events.filter(e => e.seq >= 0).map(e => [e.seq, e])).values()].sort((a, b) => a.seq - b.seq)
  const messages: MessageView[] = [], tools = new Map<string, ToolView>()
  const runs = new Map<string, { status: string; final?: SessionEvent }>()
  let status = 'idle', runId: string | undefined, cursor: string | undefined
  for (const e of sorted) {
    cursor = e.cursor ?? cursor
    if (e.eventType === 'user.message') {
      const text = messageText({ content: e.payload.content })
      if (text) messages.push({ id: `event-${e.seq}`, role: 'user', text })
      status = 'queued'
    }
    if (e.eventType === 'run.started' && e.runId) {
      runId = e.runId; status = 'running'; runs.set(e.runId, { status })
    }
    const text = assistantText(e)
    if (text.trim()) {
      messages.push({ id: `event-${e.seq}`, role: 'assistant', text })
      if (e.runId) { const r = runs.get(e.runId) ?? { status: 'running' }; r.final = e; runs.set(e.runId, r) }
    }
    const t = toolCall(e)
    if (t?.toolCallId) {
      const old = tools.get(t.toolCallId)
      const args = t.args ?? {}
      const hint = [args.query, args.url].find(v => typeof v === 'string') as string | undefined
      tools.set(t.toolCallId, { id: t.toolCallId, runId: e.runId ?? old?.runId, name: t.toolName || old?.name || 'tool',
        hint: hint?.slice(0, 180) ?? old?.hint ?? '', url: typeof args.url === 'string' ? safeUrl(args.url) : old?.url,
        phase: typeof e.payload.phase === 'string' ? e.payload.phase : t.phase,
        error: t.isError ?? false, seq: e.seq, executed: e.payload.executionStarted !== false })
      if (t.phase === 'blocked') status = 'awaiting_approval'
    }
    const outcome = runOutcome(e)
    if (outcome && e.runId) {
      const r = runs.get(e.runId) ?? { status: outcome }; r.status = outcome; runs.set(e.runId, r)
      if (e.runId === runId) status = outcome
    }
  }
  const briefs: BriefView[] = []
  for (const [id, r] of runs) {
    if (r.status !== 'succeeded' || !r.final) continue
    const markdown = assistantText(r.final)
    if (!/^#\s+\S/m.test(markdown) || !/^##\s+(?:摘要|Summary)\s*$/im.test(markdown)) continue
    const sources = sourcesOf(markdown)
    if (!sources.length) continue
    for (const source of sources) {
      const fetched = [...tools.values()].find(t => t.name === 'web_fetch' && t.url === source.url &&
        t.phase === 'end' && !t.error && t.executed && t.seq <= r.final!.seq)
      if (fetched) source.state = fetched.runId === id ? 'read' : 'earlier'
      else if (sorted.some(e => e.seq <= r.final!.seq && e.eventType === 'agent.tool' && e.payload.phase === 'end' &&
        e.payload.toolName === 'web_search' && e.payload.isError !== true && typeof e.payload.resultPreview === 'string' &&
        (e.payload.resultPreview as string).includes(source.url))) source.state = 'search'
    }
    briefs.push({ id: `brief-${r.final.seq}`, runId: id, markdown, sources,
      ready: sources.length >= 2 && sources.every(s => s.state === 'read' || s.state === 'earlier'), date: r.final.createdAt })
  }
  // A newly queued input can appear after the previous terminal: do not overwrite it with stale state.
  if (sessionStatus && ['running', 'awaiting_approval'].includes(sessionStatus)) status = sessionStatus
  return { messages, tools: [...tools.values()], briefs, status, lastSeq: sorted.at(-1)?.seq ?? 0, cursor, runId,
    searches: [...tools.values()].filter(t => t.name === 'web_search').length,
    fetches: [...tools.values()].filter(t => t.name === 'web_fetch').length }
}
export function markdownFilename(title: string): string {
  return (title.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '').trim().slice(0, 70) || 'research-brief') + '.md'
}
