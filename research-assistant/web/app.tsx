// React/useChat/sidebar structure adapted from Anthropic's MIT Chat SDK sample.
// Source and license: ../REFERENCES.md, ../third-party/anthropic-MIT.txt.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Markdown from 'react-markdown'
import { useChat, type UIMessage } from '@chat-adapter/web/react'
import { safeUrl, type BriefView, type ResearchView, type SourceView, type ToolView } from '../src/brief.js'
import { SdkDebugPanel } from './sdk-debug.js'

type View = ResearchView & { title: string; archived: boolean }
type Summary = { id: string; title: string; status: string; updatedAt: string; uncertain: boolean }
type ChatMessage = UIMessage<{ requestId?: string }>
const running = (status: string) => ['queued', 'running', 'awaiting_approval', 'uncertain'].includes(status)
const statusLabels: Record<string, string> = { idle: 'Ready to research', creating: 'Creating', queued: 'Waiting to start', running: 'Research in progress', succeeded: 'Research finished', failed: 'Research failed', aborted: 'Stopped', uncertain: 'Submission unconfirmed', awaiting_approval: 'Needs attention' }
const errors: Record<string, string> = { research_busy: 'Research is still running in this session. Wait or stop it before sending another question.', conversation_not_found: 'Session not found. Choose a session from your history.', session_creation_uncertain: 'Session creation is unconfirmed. Keep this topic and retry the original request.', invalid_input: 'Enter a valid research topic.', local_same_origin_required: 'Open the app from its current local address.', input_not_accepted: 'Your input was not accepted. Refresh the session status.', history_pagination_unavailable: 'This service does not support complete history pagination. Check the deployment.' }
Object.assign(errors, { http_401: 'The Project key is invalid or expired. Check the server configuration.', http_402: 'Platform credits are insufficient. Your input was not accepted. Add credits before submitting again.', http_403: 'This Project cannot submit input. Check the server configuration.', http_429: 'Platform rate limit reached. Your input was not accepted. Try again later.' })
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(errors[result.error ?? ''] ?? (response.status === 402 ? 'Platform credits are insufficient. Add credits to continue.' : response.status === 401 ? 'The Project key is invalid or expired. Check the server configuration.' : 'The service is unavailable. Check your connection and refresh.'))
  }
  return response.json() as Promise<T>
}
const toMessages = (view: View): ChatMessage[] => view.messages.map(m => ({ id: m.id, role: m.role, parts: [{ type: 'text', text: m.text }] }))
function Report({ text, sources = [] }: { text: string; sources?: SourceView[] }) {
  return <Markdown skipHtml disallowedElements={['img']} urlTransform={url => safeUrl(url) ?? ''} components={{
    a: ({ href, children }) => {
      const index = sources.findIndex(s => s.url === safeUrl(href ?? ''))
      const citation = index >= 0 && /^\d+$/.test(String(children))
      return <a href={href} target={citation ? undefined : '_blank'} rel="noopener noreferrer" onClick={citation ? e => {
        e.preventDefault(); const element = document.getElementById(`source-${index}`); element?.scrollIntoView({ block: 'nearest' }); element?.focus()
      } : undefined}>{children}</a>
    },
  }}>{text}</Markdown>
}
function Sources({ brief }: { brief?: BriefView }) {
  const labels = { read: 'Read in this run', earlier: 'Read earlier', search: 'Found in search', unverified: 'Not confirmed' }
  return <aside className="sources" aria-label="Research sources"><h2>Sources</h2>
    {!brief ? <p className="muted">Sources cited in the brief will appear here when research finishes.</p> : <>
      <ol>{brief.sources.map((source, i) => <li key={source.url} id={`source-${i}`} tabIndex={-1}>
        <span className="source-number">{i + 1}</span><div><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
          <span className="domain">{new URL(source.url).hostname}</span><span className="source-state">{labels[source.state]}</span></div>
      </li>)}</ol><p className="source-note">Read status comes from tool events. It does not independently verify each claim.</p>
    </>}
  </aside>
}
function Activity({ tools, status }: { tools: ToolView[]; status: string }) {
  const successful = tools.filter(t => t.phase === 'end' && !t.error && t.executed).length
  return <details className="activity" open={running(status) || undefined}><summary><span className="activity-toggle"><svg className="inline-icon chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>Research activity<span className="activity-status">{statusLabels[status] ?? 'Status unconfirmed'}</span></span>
    <span className="muted">{tools.length ? `${successful} completed / ${tools.length} tool ${tools.length === 1 ? 'call' : 'calls'}` : 'Waiting for research events'}</span></summary>
    {tools.length > 0 && <ol>{tools.slice(-100).map(t => <li key={t.id}>
      <span className={`tool-state ${t.error ? 'failed' : ''}`}>{t.error ? 'Failed' : t.phase === 'end' ? t.executed ? 'Completed' : 'Not executed' : t.phase === 'blocked' ? 'Needs attention' : 'In progress'}</span>
      <div><strong>{t.name === 'web_search' ? 'Search the web' : t.name === 'web_fetch' ? 'Fetch a page' : t.name}</strong><span>{t.hint}</span></div>
    </li>)}</ol>}
  </details>
}
function Conversation({ id, initial, onChanged }: { id: string; initial?: { text: string; requestId: string }; onChanged: () => void }) {
  const [view, setView] = useState<View>(), [fault, setFault] = useState(''), [draft, setDraft] = useState(() => localStorage.getItem(`research:draft:${id}`) ?? '')
  const [tab, setTab] = useState<'brief' | 'chat'>('brief'), [version, setVersion] = useState(''), [copied, setCopied] = useState(false)
  const [stopping, setStopping] = useState(false), [observing, setObserving] = useState(false)
  const started = useRef(false), mounted = useRef(true), refreshing = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const { messages, sendMessage, setMessages, clearError, status, error } = useChat<ChatMessage>({ threadId: id })
  const transportBusy = status === 'submitted' || status === 'streaming'
  const transportRef = useRef(transportBusy); transportRef.current = transportBusy
  useEffect(() => { if (draft) localStorage.setItem(`research:draft:${id}`, draft); else localStorage.removeItem(`research:draft:${id}`) }, [id, draft])
  const refresh = useCallback(async () => {
    if (refreshing.current) return
    refreshing.current = true
    try {
      const next = await api<View>(`/api/history?conversation=${encodeURIComponent(id)}`)
      if (!mounted.current) return
      setView(next); setFault(next.problem ? errors[next.problem] ?? 'The service rejected this input. Check the configuration before submitting again.' : ''); setObserving(false)
      clearError()
      if (!transportRef.current) setMessages(toMessages(next))
      if (!running(next.status)) { localStorage.removeItem(`research:input:${id}`); onChanged() }
    } catch (e) { if (mounted.current) setFault((e as Error).message) }
    finally { refreshing.current = false }
  }, [id, setMessages, clearError, onChanged])
  const submit = useCallback(async (text: string, requestId: string = crypto.randomUUID()) => {
    if (!text.trim()) return
    setDraft(''); setFault('')
    localStorage.setItem(`research:input:${id}`, JSON.stringify({ text, requestId }))
    try { await sendMessage({ text: text.trim(), metadata: { requestId } }) }
    catch { setFault('Connection lost. Refresh the session to avoid submitting your question twice.') }
    finally { await refresh(); onChanged() }
  }, [id, sendMessage, refresh, onChanged])
  useEffect(() => {
    mounted.current = true; void refresh()
    const source = new EventSource(`/api/activity?conversation=${encodeURIComponent(id)}`)
    source.onmessage = () => { clearTimeout(timer.current); timer.current = setTimeout(() => void refresh(), 200) }
    source.onerror = () => setObserving(true)
    const poll = setInterval(() => void refresh(), 5000)
    return () => { mounted.current = false; source.close(); clearInterval(poll); clearTimeout(timer.current) }
  }, [id, refresh])
  useEffect(() => { if (initial && !started.current) { started.current = true; void submit(initial.text, initial.requestId) } }, [initial, submit])
  useEffect(() => { if (!transportBusy && started.current) void refresh() }, [transportBusy, refresh])
  const latest = view?.briefs.at(-1)
  useEffect(() => { if (latest) { setVersion(latest.id); setTab('brief') } }, [latest?.id])
  const brief = view?.briefs.find(b => b.id === version) ?? latest
  const busy = transportBusy || running(view?.status ?? 'idle')
  const stop = async () => {
    setStopping(true)
    try { const r = await api<{ accepted: boolean }>(`/api/sessions/${id}/interrupt`, {}); if (!r.accepted) await refresh() }
    catch (e) { setFault((e as Error).message) }
    finally { setStopping(false) }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(brief!.markdown); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { setFault('Clipboard access is unavailable. Use Export Markdown instead.') } }
  return <div className="workspace">
    <header className="research-header"><div><h1>{view?.title ?? 'Loading research…'}</h1><p aria-live="polite">{busy ? statusLabels[view?.status ?? 'queued'] : brief ? brief.ready ? 'Brief ready' : 'Brief ready; some sources are not confirmed' : statusLabels[view?.status ?? 'idle']}</p></div>
      <div className="report-actions">{brief && <><button onClick={() => void copy()}>{copied ? 'Copied' : 'Copy brief'}</button><a className="button primary" href={`/api/sessions/${id}/briefs/${brief.id}/markdown`}>Export Markdown</a></>}
        <button onClick={() => void refresh()} aria-label="Refresh session">Refresh</button></div>
    </header>
    {(fault || error || observing) && <div className="notice" role="status">{fault || (error ? 'Connection interrupted. Refresh the status. Submitted questions will not be resent automatically.' : 'Progress connection interrupted. Reconnecting without resending input.')}<button onClick={() => void refresh()}>Refresh</button></div>}
    {view?.archived && <p className="notice">This session is archived. You can read and export it, but cannot continue research.</p>}
    <div className="tabs"><button className={tab === 'brief' ? 'active' : ''} onClick={() => setTab('brief')}>Research brief</button><button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Conversation <span>{view?.messages.length ?? 0}</span></button>
      {view && view.briefs.length > 1 && <label className="versions">Version <select aria-label="Brief version" value={brief?.id} onChange={e => setVersion(e.target.value)}>{view.briefs.map((b, i) => <option key={b.id} value={b.id}>Version {i + 1}</option>)}</select></label>}
    </div>
    <div className="reading-layout"><main className="reading">
      {tab === 'brief' ? brief ? <article className="report"><Report text={brief.markdown} sources={brief.sources} /></article> : <section className="awaiting"><h2>{busy ? 'Gathering sources' : 'No brief yet'}</h2><p>Searches, fetched pages and results are saved in this session. Return anytime to continue.</p>
        {messages.length > 0 && <div className="acknowledgment"><Report text={messages.at(-1)?.parts.filter(p => p.type === 'text').map(p => p.text).join('') ?? ''} /></div>}</section> :
        <section className="transcript" aria-label="Conversation">{(transportBusy ? messages : toMessages(view ?? { messages: [] } as unknown as View)).map(m => <article key={m.id} className={m.role}><span className="speaker">{m.role === 'user' ? 'Your question' : 'Research Assistant'}</span><Report text={m.parts.filter(p => p.type === 'text').map(p => p.text).join('')} /></article>)}</section>}
      <Activity tools={view?.tools ?? []} status={view?.status ?? (transportBusy ? 'queued' : 'idle')} />
    </main><Sources brief={brief} /></div>
    <footer className="composer"><form onSubmit={e => { e.preventDefault(); if (!busy) void submit(draft) }}>
      <label htmlFor="followup">Continue research</label><textarea id="followup" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Explore another angle, or describe how to update this brief…" rows={2} maxLength={12000} disabled={view?.archived} />
      <div><button type="button" onClick={() => setDraft('Update the brief: ')} disabled={busy || view?.archived}>Update brief</button><p>{busy ? 'Research continues on the server, even if you close this page.' : 'Follow-ups use the research already saved in this session.'}</p>
        {busy ? <button type="button" className="stop" onClick={() => void stop()} disabled={stopping}>{stopping ? 'Requesting stop…' : 'Stop research'}</button> : <button className="primary" disabled={!draft.trim() || view?.archived}>Send follow-up</button>}</div>
    </form></footer>
  </div>
}
function App() {
  const [sessions, setSessions] = useState<Summary[]>([]), [next, setNext] = useState<number | null>(null), [fault, setFault] = useState('')
  const [id, setId] = useState(() => new URLSearchParams(location.search).get('conversation') ?? localStorage.getItem('research:active') ?? '')
  const [topic, setTopic] = useState(''), [creating, setCreating] = useState(false), [initial, setInitial] = useState<{ text: string; requestId: string }>()
  const [drawer, setDrawer] = useState(false), [fixture, setFixture] = useState(false)
  const pending = useRef<{ topic: string; requestId: string } | undefined>(undefined)
  const list = useCallback(async (offset = 0) => {
    try { const r = await api<{ sessions: Summary[]; next: number | null }>(`/api/sessions?offset=${offset}`); setSessions(s => offset ? [...s, ...r.sessions] : r.sessions); setNext(r.next); setFault('') }
    catch (e) { setFault((e as Error).message) }
  }, [])
  useEffect(() => { void list(); void api<{ fixture: boolean }>('/api/info').then(v => setFixture(v.fixture));
    try { const previous = JSON.parse(localStorage.getItem('research:create') ?? 'null') as typeof pending.current; if (previous) { pending.current = previous; setTopic(previous.topic) } } catch {}
  }, [list])
  const choose = (value: string) => { setId(value); setInitial(undefined); setDrawer(false); localStorage.setItem('research:active', value); history.replaceState(null, '', value ? `/?conversation=${encodeURIComponent(value)}` : '/'); void list() }
  const create = async () => {
    if (!topic.trim() || creating) return
    setCreating(true); setFault('')
    if (pending.current?.topic !== topic.trim()) pending.current = { topic: topic.trim(), requestId: crypto.randomUUID() }
    localStorage.setItem('research:create', JSON.stringify(pending.current))
    try {
      const r = await api<{ id: string }>('/api/sessions', pending.current)
      const first = { text: topic.trim(), requestId: pending.current!.requestId }
      choose(r.id); setInitial(first); setTopic(''); pending.current = undefined; localStorage.removeItem('research:create')
    } catch (e) { setFault((e as Error).message) }
    finally { setCreating(false) }
  }
  return <div className="app"><div className="mobile-bar"><button onClick={() => setDrawer(!drawer)} aria-expanded={drawer}>Research history</button><span>Research Assistant</span></div>
    {drawer && <button className="drawer-backdrop" aria-label="Close history" onClick={() => setDrawer(false)} />}
    <aside className={`sidebar ${drawer ? 'visible' : ''}`}><div className="brand"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 4h13l5 5v19H7zM20 4v6h5M11 15h10M11 20h8" /></svg><span>Research Assistant</span></div>
      <button className="new-research" onClick={() => choose('')}><svg className="inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>New research</button><h2>Research history</h2>
      <nav aria-label="Research history">{sessions.length === 0 && <p className="muted">Your saved research will appear here.</p>}{sessions.map(s => <button key={s.id} className={`session ${id === s.id ? 'selected' : ''}`} onClick={() => choose(s.id)} title={s.title}><span>{s.title}</span><small>{statusLabels[s.status] ?? s.status} · {new Date(s.updatedAt).toLocaleDateString('en-US')}</small></button>)}</nav>
      {next !== null && <button onClick={() => void list(next)}>Load more</button>}
      <div className="sidebar-footer"><p>{fixture ? 'Offline demo · Simulated sources' : 'Local single-user research'}</p><span>{fixture ? 'No Platform calls' : 'Sessions saved in Platform'}</span></div>
    </aside>
    <div className="content"><SdkDebugPanel conversation={id} />{id ? <Conversation key={id} id={id} initial={initial} onChanged={list} /> : <main className="welcome"><span className="document-mark" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M12 6h19l6 6v30H12zM30 6v8h7M18 22h13M18 28h13M18 34h8" /></svg></span><h1>Start with a question.<br />Build an answer with sources.</h1><p>Search public sources and create a brief. Inspect the sources,<br className="desktop-break" />save your research and return with follow-up questions.</p>
      <form className="topic-form" onSubmit={e => { e.preventDefault(); void create() }}><label htmlFor="topic">What would you like to research?</label><textarea id="topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder="For example: Which Node.js versions are in LTS, and how should I choose?" rows={4} maxLength={4000} />
        <div><span>Follow actual search and fetch activity.</span><button className="primary" disabled={!topic.trim() || creating}>{creating ? 'Creating session…' : pending.current ? 'Retry creation' : 'Start research'}</button></div></form>
      <div className="examples"><p>Try one of these questions</p>{['Current Node.js LTS versions and support timelines', 'Compare server-side rendering in React and Vue', 'Battery recycling technologies and their limitations'].map(t => <button key={t} onClick={() => setTopic(t)}>{t}<svg className="inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" /></svg></button>)}</div>
    </main>}{fault && <div className="app-fault notice" role="alert">{fault}</div>}</div>
  </div>
}
createRoot(document.getElementById('root')!).render(<App />)
