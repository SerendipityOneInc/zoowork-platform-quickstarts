import { useEffect, useState } from 'react'
import type { DebugView, SdkCallView } from '../src/sdk-debug.js'

const reads = new Set(['getAgent', 'getSession', 'listEventsPage', 'listSessionPage'])
const purpose = (call: SdkCallView) => ({ getAgent: '核对 Agent', getSession: '读取会话', createSession: '创建会话',
  postEvents: Array.isArray(call.params.types) && call.params.types.includes('user.interrupt') ? '请求中断' : '提交输入',
  listEventsPage: '读取历史事件', streamEvents: '接收实时事件', listSessionPage: '恢复会话索引',
  deleteSession: '删除会话', stopAgent: '停止 Agent', deleteAgent: '删除 Agent' }[call.method] ?? call.method)
const states = { running: '执行中', succeeded: '返回成功', failed: '调用失败', closed: '读取已结束' }
const elapsed = (ms: number) => ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
function Chevron() { return <svg className="inline-icon chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg> }

export function SdkDebugPanel({ conversation }: { conversation: string }) {
  const [open, setOpen] = useState(() => sessionStorage.getItem('research:debug-open') === 'true')
  const [view, setView] = useState<DebugView>(), [fault, setFault] = useState(false)
  const [tab, setTab] = useState<'calls' | 'events'>('calls'), [showReads, setShowReads] = useState(true), [paused, setPaused] = useState(false)
  useEffect(() => { setView(undefined); setFault(false); setPaused(false) }, [conversation])
  useEffect(() => {
    if (paused) return
    const abort = new AbortController()
    let busy = false
    const read = async () => {
      if (busy) return
      busy = true
      try {
        const response = await fetch(`/api/debug${conversation ? `?conversation=${encodeURIComponent(conversation)}` : ''}`, { signal: abort.signal })
        if (!response.ok) throw new Error('debug_unavailable')
        const next = await response.json() as DebugView
        if (!abort.signal.aborted) { setView(next); setFault(false) }
      } catch { if (!abort.signal.aborted) setFault(true) }
      finally { busy = false }
    }
    void read()
    const timer = setInterval(() => void read(), open ? 1000 : 3000)
    return () => { abort.abort(); clearInterval(timer) }
  }, [conversation, open, paused])
  const calls = (view?.calls ?? []).filter(c => showReads || !reads.has(c.method)).slice(-40).reverse()
  const events = (view?.events ?? []).slice(-60).reverse()
  return <details className="sdk-debug" open={open} onToggle={e => {
    const value = e.currentTarget.open; setOpen(value); sessionStorage.setItem('research:debug-open', String(value))
  }}>
    <summary><span><Chevron /><strong>SDK Debug</strong><span className="debug-scope">{conversation ? '当前研究' : '所有会话'}</span></span>
      <span className="debug-status">{paused ? '显示已暂停' : fault ? '暂时无法读取' : view?.active ? `${view.active} 个 SDK 调用执行中` : '查看 SDK 调用与 Platform 事件'}</span></summary>
    <div className="debug-body">
      <p className="debug-description">{view?.fixture ? '模拟模式：以下调用由离线 fixture 响应，未连接 Platform。' : '记录服务端实际 SDK 调用。工具执行由 Platform 事件返回。'}参数只显示 ID、类型和数量，不显示 key、消息正文或工具输出。</p>
      <dl className="debug-context"><div><dt>Agent ID</dt><dd><code>{view?.agentId ?? '正在读取…'}</code></dd></div>
        <div><dt>Session ID</dt><dd><code>{view?.sessionId ?? '尚未创建会话'}</code></dd></div></dl>
      <div className="debug-controls"><div role="tablist" aria-label="Debug 记录类型" onKeyDown={e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
        e.preventDefault()
        const next = e.key === 'Home' ? 'calls' : e.key === 'End' ? 'events' : tab === 'calls' ? 'events' : 'calls'
        setTab(next)
        e.currentTarget.querySelector<HTMLButtonElement>(`#debug-tab-${next}`)?.focus()
      }}>
        <button id="debug-tab-calls" role="tab" tabIndex={tab === 'calls' ? 0 : -1} aria-selected={tab === 'calls'} aria-controls="debug-calls" onClick={() => setTab('calls')}>SDK 调用</button>
        <button id="debug-tab-events" role="tab" tabIndex={tab === 'events' ? 0 : -1} aria-selected={tab === 'events'} aria-controls="debug-events" onClick={() => setTab('events')}>Platform 事件</button>
      </div><button onClick={() => setPaused(v => !v)}>{paused ? '继续显示' : '暂停显示'}</button></div>
      {fault && <p role="status" className="debug-fault">Debug 暂时无法读取，将自动重连。研究任务继续执行。</p>}
      <section id="debug-calls" role="tabpanel" aria-labelledby="debug-tab-calls" hidden={tab !== 'calls'}>
        <label className="debug-filter"><input type="checkbox" checked={showReads} onChange={e => setShowReads(e.target.checked)} />显示历史和状态读取调用</label>
        {calls.length === 0 ? <p className="muted">{view ? '当前范围还没有调用记录。提交主题或重新读取会话后会显示实际调用。' : '正在读取调用记录…'}</p> :
          <ol className="debug-log" aria-label="SDK 调用记录">{calls.map(call => <li key={call.id}>
            <div className="debug-call"><time dateTime={call.startedAt}>{new Date(call.startedAt).toLocaleTimeString('zh-CN', { hour12: false })}</time>
              <div><code>{call.method}</code><span className="debug-purpose">{purpose(call)}</span></div>
              <span className={`debug-call-state ${call.status}`}>{states[call.status]}</span><span className="debug-duration">{elapsed(call.durationMs)}</span></div>
            <details className="debug-params"><summary>参数与结果{call.received !== undefined ? ` · 已接收 ${call.received} 个事件` : ''}</summary>
              <pre>{JSON.stringify({ params: call.params, ...(call.result ? { result: call.result } : {}), ...(call.error ? { error: call.error } : {}) }, null, 2)}</pre>
            </details>
          </li>)}</ol>}
      </section><section id="debug-events" role="tabpanel" aria-labelledby="debug-tab-events" hidden={tab !== 'events'}>
        <p className="debug-description">历史读取和实时 stream 分别标注；同一 Session 的 seq 去重。历史工具事件不代表本次又调用了工具。</p>
        {events.length === 0 ? <p className="muted">当前范围还没有收到 durable events。</p> : <ol className="debug-log debug-events" aria-label="Platform 事件记录">{events.map(event => <li key={`${event.sessionId}:${event.seq}`}>
          <div><code>seq {event.seq}</code><strong>{event.type}</strong><span>{event.sources.map(s => s === 'stream' ? '实时 stream' : '历史读取').join(' / ')}</span></div>
          {(event.tool || event.outcome) && <p><code>{event.tool}</code> {event.phase === 'start' ? '开始执行' : event.phase === 'end' ? '执行返回' : event.phase === 'blocked' ? '待处理' : event.phase} {event.outcome}</p>}
          {event.runId && <p className="debug-run">Run ID <code>{event.runId}</code></p>}
        </li>)}</ol>}
      </section>
      <p className="debug-note">仅记录本次服务启动后的调用，最多保留 160 条调用和 200 个事件；页面显示最近 40 条调用或 60 个事件。启动前的 setup 不补写记录。{view && <>记录开始于 <time>{new Date(view.startedAt).toLocaleString('zh-CN')}</time>。</>}</p>
    </div>
  </details>
}
