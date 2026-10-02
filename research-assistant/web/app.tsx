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
const statusLabels: Record<string, string> = { idle: '准备研究', creating: '正在创建', queued: '等待研究开始', running: '研究进行中', succeeded: '研究已结束', failed: '研究失败', aborted: '已停止', uncertain: '提交状态待确认', awaiting_approval: '等待处理' }
const errors: Record<string, string> = { research_busy: '这个会话仍在研究，请等待或停止后再发送。', conversation_not_found: '无法找到这个会话，请重新选择历史。', session_creation_uncertain: '会话创建结果待确认。请保留当前主题，使用原请求重试创建。', invalid_input: '请填写有效的研究主题。', local_same_origin_required: '请从当前本地地址打开应用。', input_not_accepted: '输入未被接受，请重新读取状态。', history_pagination_unavailable: '当前服务不支持完整历史分页，请检查部署。' }
Object.assign(errors, { http_401: 'Project key 无效或过期，请检查服务端配置。', http_402: 'Platform 余额不足，本次输入未被接受。请充值后再提交。', http_403: '当前 Project 无权提交输入，请检查服务端配置。', http_429: 'Platform 请求过于频繁，本次输入未被接受。请稍后再提交。' })
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(errors[result.error ?? ''] ?? (response.status === 402 ? 'Platform 余额不足，请充值后继续。' : response.status === 401 ? 'Project key 无效或过期，请检查服务端配置。' : '暂时无法读取服务，请检查连接并重新读取。'))
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
  const labels = { read: '本轮已读取', earlier: '此前研究已读取', search: '搜索结果中出现', unverified: '尚未核对' }
  return <aside className="sources" aria-label="研究来源"><h2>来源</h2>
    {!brief ? <p className="muted">研究完成后，这里会列出简报引用的资料。</p> : <>
      <ol>{brief.sources.map((source, i) => <li key={source.url} id={`source-${i}`} tabIndex={-1}>
        <span className="source-number">{i + 1}</span><div><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
          <span className="domain">{new URL(source.url).hostname}</span><span className="source-state">{labels[source.state]}</span></div>
      </li>)}</ol><p className="source-note">读取状态来自工具记录，不表示每项事实已被独立验证。</p>
    </>}
  </aside>
}
function Activity({ tools, status }: { tools: ToolView[]; status: string }) {
  const successful = tools.filter(t => t.phase === 'end' && !t.error && t.executed).length
  return <details className="activity" open={running(status) || undefined}><summary><span className="activity-toggle"><svg className="inline-icon chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>查看研究过程<span className="activity-status">{statusLabels[status] ?? '状态待确认'}</span></span>
    <span className="muted">{tools.length ? `${successful} 次完成 / ${tools.length} 次工具调用` : '等待实际研究事件'}</span></summary>
    {tools.length > 0 && <ol>{tools.slice(-100).map(t => <li key={t.id}>
      <span className={`tool-state ${t.error ? 'failed' : ''}`}>{t.error ? '失败' : t.phase === 'end' ? t.executed ? '完成' : '未执行' : t.phase === 'blocked' ? '待处理' : '进行中'}</span>
      <div><strong>{t.name === 'web_search' ? '搜索资料' : t.name === 'web_fetch' ? '读取网页' : t.name}</strong><span>{t.hint}</span></div>
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
      setView(next); setFault(next.problem ? errors[next.problem] ?? '本次输入被服务拒绝，请检查配置后再提交。' : ''); setObserving(false)
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
    catch { setFault('连接已断开。请重新读取会话，避免重复提交问题。') }
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
  const copy = async () => { try { await navigator.clipboard.writeText(brief!.markdown); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { setFault('无法访问剪贴板，请使用导出 Markdown。') } }
  return <div className="workspace">
    <header className="research-header"><div><h1>{view?.title ?? '正在读取研究…'}</h1><p aria-live="polite">{busy ? statusLabels[view?.status ?? 'queued'] : brief ? brief.ready ? '简报就绪' : '简报已生成，部分来源待核对' : statusLabels[view?.status ?? 'idle']}</p></div>
      <div className="report-actions">{brief && <><button onClick={() => void copy()}>{copied ? '已复制' : '复制简报'}</button><a className="button primary" href={`/api/sessions/${id}/briefs/${brief.id}/markdown`}>导出 Markdown</a></>}
        <button onClick={() => void refresh()} aria-label="重新读取会话">重新读取</button></div>
    </header>
    {(fault || error || observing) && <div className="notice" role="status">{fault || (error ? '连接暂时中断。请重新读取状态，已提交的问题不会自动重发。' : '进度连接暂时中断，正在只读恢复。')}<button onClick={() => void refresh()}>重新读取</button></div>}
    {view?.archived && <p className="notice">此会话已归档，可以阅读和导出，不能继续研究。</p>}
    <div className="tabs"><button className={tab === 'brief' ? 'active' : ''} onClick={() => setTab('brief')}>研究简报</button><button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>对话记录 <span>{view?.messages.length ?? 0}</span></button>
      {view && view.briefs.length > 1 && <label className="versions">版本 <select aria-label="简报版本" value={brief?.id} onChange={e => setVersion(e.target.value)}>{view.briefs.map((b, i) => <option key={b.id} value={b.id}>第 {i + 1} 版</option>)}</select></label>}
    </div>
    <div className="reading-layout"><main className="reading">
      {tab === 'brief' ? brief ? <article className="report"><Report text={brief.markdown} sources={brief.sources} /></article> : <section className="awaiting"><h2>{busy ? '正在收集研究资料' : '这个研究还没有简报'}</h2><p>搜索、读取和研究结果会保存在这个会话。你可以随时回来继续。</p>
        {messages.length > 0 && <div className="acknowledgment"><Report text={messages.at(-1)?.parts.filter(p => p.type === 'text').map(p => p.text).join('') ?? ''} /></div>}</section> :
        <section className="transcript" aria-label="对话记录">{(transportBusy ? messages : toMessages(view ?? { messages: [] } as unknown as View)).map(m => <article key={m.id} className={m.role}><span className="speaker">{m.role === 'user' ? '你的问题' : '研究助手'}</span><Report text={m.parts.filter(p => p.type === 'text').map(p => p.text).join('')} /></article>)}</section>}
      <Activity tools={view?.tools ?? []} status={view?.status ?? (transportBusy ? 'queued' : 'idle')} />
    </main><Sources brief={brief} /></div>
    <footer className="composer"><form onSubmit={e => { e.preventDefault(); if (!busy) void submit(draft) }}>
      <label htmlFor="followup">继续研究</label><textarea id="followup" value={draft} onChange={e => setDraft(e.target.value)} placeholder="补充一个角度，或告诉我怎样更新这份简报…" rows={2} maxLength={12000} disabled={view?.archived} />
      <div><button type="button" onClick={() => setDraft('更新简报：')} disabled={busy || view?.archived}>更新简报</button><p>{busy ? '研究在服务端继续；关闭页面不会停止。' : '追问沿用这个会话的研究资料。'}</p>
        {busy ? <button type="button" className="stop" onClick={() => void stop()} disabled={stopping}>{stopping ? '正在请求停止…' : '停止研究'}</button> : <button className="primary" disabled={!draft.trim() || view?.archived}>发送追问</button>}</div>
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
  return <div className="app"><div className="mobile-bar"><button onClick={() => setDrawer(!drawer)} aria-expanded={drawer}>研究历史</button><span>Research Assistant</span></div>
    {drawer && <button className="drawer-backdrop" aria-label="关闭历史" onClick={() => setDrawer(false)} />}
    <aside className={`sidebar ${drawer ? 'visible' : ''}`}><div className="brand"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 4h13l5 5v19H7zM20 4v6h5M11 15h10M11 20h8" /></svg><span>Research Assistant</span></div>
      <button className="new-research" onClick={() => choose('')}><svg className="inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>新研究</button><h2>研究历史</h2>
      <nav aria-label="研究历史">{sessions.length === 0 && <p className="muted">你的研究会保存到这里。</p>}{sessions.map(s => <button key={s.id} className={`session ${id === s.id ? 'selected' : ''}`} onClick={() => choose(s.id)} title={s.title}><span>{s.title}</span><small>{statusLabels[s.status] ?? s.status} · {new Date(s.updatedAt).toLocaleDateString('zh-CN')}</small></button>)}</nav>
      {next !== null && <button onClick={() => void list(next)}>加载更多</button>}
      <div className="sidebar-footer"><p>{fixture ? '离线演示 · 模拟资料' : '本地单用户研究助手'}</p><span>{fixture ? '未调用 Platform' : '会话由 Platform 持久保存'}</span></div>
    </aside>
    <div className="content"><SdkDebugPanel conversation={id} />{id ? <Conversation key={id} id={id} initial={initial} onChanged={list} /> : <main className="welcome"><span className="document-mark" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M12 6h19l6 6v30H12zM30 6v8h7M18 22h13M18 28h13M18 34h8" /></svg></span><h1>从一个问题开始，<br />找到有来源的答案。</h1><p>检索公开资料，整理成简报。查看每条来源，<br className="desktop-break" />保存研究，回来继续追问。</p>
      <form className="topic-form" onSubmit={e => { e.preventDefault(); void create() }}><label htmlFor="topic">你想研究什么？</label><textarea id="topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder="例如：Node.js 当前的 LTS 版本有哪些？适合如何选择？" rows={4} maxLength={4000} />
        <div><span>研究会显示实际检索进度。</span><button className="primary" disabled={!topic.trim() || creating}>{creating ? '正在创建会话…' : pending.current ? '继续创建' : '开始研究'}</button></div></form>
      <div className="examples"><p>也可以从这些问题开始</p>{['Node.js 当前 LTS 版本与支持周期', '比较 React 和 Vue 的服务端渲染方案', '研究电池回收的主要技术与限制'].map(t => <button key={t} onClick={() => setTopic(t)}>{t}<svg className="inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" /></svg></button>)}</div>
    </main>}{fault && <div className="app-fault notice" role="alert">{fault}</div>}</div>
  </div>
}
createRoot(document.getElementById('root')!).render(<App />)
