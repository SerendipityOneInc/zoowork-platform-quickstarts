import { useEffect, useState } from 'react'
import type { DebugView, SdkCallView } from '../src/sdk-debug.js'

const reads = new Set(['getAgent', 'getSession', 'listEventsPage', 'listSessionPage'])
const purpose = (call: SdkCallView) => ({ getAgent: 'Check Agent', getSession: 'Read Session', createSession: 'Create Session',
  postEvents: Array.isArray(call.params.types) && call.params.types.includes('user.interrupt') ? 'Request interrupt' : 'Submit input',
  listEventsPage: 'Read event history', streamEvents: 'Receive live events', listSessionPage: 'Recover session index',
  deleteSession: 'Delete Session', stopAgent: 'Stop Agent', deleteAgent: 'Delete Agent' }[call.method] ?? call.method)
const states = { running: 'Running', succeeded: 'Succeeded', failed: 'Failed', closed: 'Closed' }
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
    <summary><span><Chevron /><strong>SDK Debug</strong><span className="debug-scope">{conversation ? 'Current research' : 'All sessions'}</span></span>
      <span className="debug-status">{paused ? 'Display paused' : fault ? 'Unavailable' : view?.active ? `${view.active} SDK ${view.active === 1 ? 'call' : 'calls'} running` : 'Inspect SDK calls and Platform events'}</span></summary>
    <div className="debug-body">
      <p className="debug-description">{view?.fixture ? 'Simulated mode: offline fixtures respond to these calls. Platform is not connected. ' : 'Actual server-side SDK calls. Platform events report tool execution. '}Argument summaries show IDs, types and counts. Keys, message text and tool output are excluded.</p>
      <dl className="debug-context"><div><dt>Agent ID</dt><dd><code>{view?.agentId ?? 'Loading…'}</code></dd></div>
        <div><dt>Session ID</dt><dd><code>{view?.sessionId ?? 'No Session created'}</code></dd></div></dl>
      <div className="debug-controls"><div role="tablist" aria-label="Debug record type" onKeyDown={e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
        e.preventDefault()
        const next = e.key === 'Home' ? 'calls' : e.key === 'End' ? 'events' : tab === 'calls' ? 'events' : 'calls'
        setTab(next)
        e.currentTarget.querySelector<HTMLButtonElement>(`#debug-tab-${next}`)?.focus()
      }}>
        <button id="debug-tab-calls" role="tab" tabIndex={tab === 'calls' ? 0 : -1} aria-selected={tab === 'calls'} aria-controls="debug-calls" onClick={() => setTab('calls')}>SDK calls</button>
        <button id="debug-tab-events" role="tab" tabIndex={tab === 'events' ? 0 : -1} aria-selected={tab === 'events'} aria-controls="debug-events" onClick={() => setTab('events')}>Platform events</button>
      </div><button onClick={() => setPaused(v => !v)}>{paused ? 'Resume display' : 'Pause display'}</button></div>
      {fault && <p role="status" className="debug-fault">Debug data is unavailable. Reconnecting automatically; research continues.</p>}
      <section id="debug-calls" role="tabpanel" aria-labelledby="debug-tab-calls" hidden={tab !== 'calls'}>
        <label className="debug-filter"><input type="checkbox" checked={showReads} onChange={e => setShowReads(e.target.checked)} />Show history and status reads</label>
        {calls.length === 0 ? <p className="muted">{view ? 'No calls in this scope yet. Submit a topic or refresh a session to see actual calls.' : 'Loading call records…'}</p> :
          <ol className="debug-log" aria-label="SDK call log">{calls.map(call => <li key={call.id}>
            <div className="debug-call"><time dateTime={call.startedAt}>{new Date(call.startedAt).toLocaleTimeString('en-US', { hour12: false })}</time>
              <div><code>{call.method}</code><span className="debug-purpose">{purpose(call)}</span></div>
              <span className={`debug-call-state ${call.status}`}>{states[call.status]}</span><span className="debug-duration">{elapsed(call.durationMs)}</span></div>
            <details className="debug-params"><summary>Arguments and results{call.received !== undefined ? ` · ${call.received} ${call.received === 1 ? 'event' : 'events'} received` : ''}</summary>
              <pre>{JSON.stringify({ params: call.params, ...(call.result ? { result: call.result } : {}), ...(call.error ? { error: call.error } : {}) }, null, 2)}</pre>
            </details>
          </li>)}</ol>}
      </section><section id="debug-events" role="tabpanel" aria-labelledby="debug-tab-events" hidden={tab !== 'events'}>
        <p className="debug-description">History reads and live streams are labeled separately and deduplicated by Session and seq. Historical tool events do not mean the tool ran again.</p>
        {events.length === 0 ? <p className="muted">No durable events in this scope yet.</p> : <ol className="debug-log debug-events" aria-label="Platform event log">{events.map(event => <li key={`${event.sessionId}:${event.seq}`}>
          <div><code>seq {event.seq}</code><strong>{event.type}</strong><span>{event.sources.map(s => s === 'stream' ? 'Live stream' : 'History read').join(' / ')}</span></div>
          {(event.tool || event.outcome) && <p><code>{event.tool}</code> {event.phase === 'start' ? 'Started' : event.phase === 'end' ? 'Returned' : event.phase === 'blocked' ? 'Needs attention' : event.phase} {event.outcome}</p>}
          {event.runId && <p className="debug-run">Run ID <code>{event.runId}</code></p>}
        </li>)}</ol>}
      </section>
      <p className="debug-note">Records calls since this server started, retaining up to 160 calls and 200 events. Displays the latest 40 calls or 60 events. Earlier setup calls are not added. {view && <>Recording started <time>{new Date(view.startedAt).toLocaleString('en-US')}</time>.</>}</p>
    </div>
  </details>
}
