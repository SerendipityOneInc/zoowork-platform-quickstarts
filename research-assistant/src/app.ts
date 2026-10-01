// Hono route separation adapted from Anthropic's MIT quickstart; see ../REFERENCES.md.
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createBot, localRequest } from './bot.js'
import { validId } from './conversations.js'
import { markdownFilename } from './brief.js'
import { FoundationError, safeError } from './platform.js'
import type { Research } from './turns.js'

export function createApi(research: Research, fixture = false): Hono {
  const app = new Hono(), bot = createBot(research)
  app.use('/api/*', bodyLimit({ maxSize: 128 * 1024 }))
  app.use('/api/*', async (c, next) => {
    if (!localRequest(c.req.raw)) return c.json({ error: 'local_same_origin_required' }, 403)
    if (c.req.method === 'POST' && !c.req.header('content-type')?.startsWith('application/json')) return c.json({ error: 'json_required' }, 415)
    c.header('Cache-Control', 'no-store')
    c.header('X-Content-Type-Options', 'nosniff')
    await next()
  })
  app.onError((error, c) => {
    const code = safeError(error)
    const status = error instanceof FoundationError ?
      code.includes('not_found') ? 404 : code === 'invalid_input' ? 400 : 409 :
      typeof error === 'object' && 'status' in error && [400, 401, 402, 403, 404, 409, 429].includes(Number(error.status)) ? Number(error.status) : 503
    return new Response(JSON.stringify({ error: code }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  })
  app.get('/api/info', c => c.json({ fixture, application: 'Research Assistant' }))
  app.get('/api/sessions', async c => {
    const offset = Math.max(0, Number(c.req.query('offset') ?? 0))
    if (!Number.isSafeInteger(offset)) throw new FoundationError('invalid_input')
    const records = (await research.store.list()).filter(r => r.status !== 'deleted'), page = records.slice(offset, offset + 30)
    return c.json({ sessions: page.map(r => ({ id: r.id, title: r.title, status: r.status, updatedAt: r.updatedAt,
      uncertain: !r.sessionId })), next: offset + 30 < records.length ? offset + 30 : null })
  })
  app.post('/api/sessions', async c => {
    const body = await c.req.json<{ topic?: unknown; requestId?: unknown }>()
    if (typeof body.topic !== 'string' || !validId(body.requestId)) throw new FoundationError('invalid_input')
    const record = await research.store.create(body.topic, body.requestId)
    return c.json({ id: record.id })
  })
  app.post('/api/chat', async c => {
    const body = await c.req.raw.clone().json() as { id?: unknown; messages?: { role?: string; parts?: { type?: string; text?: string }[]; metadata?: { requestId?: unknown } }[] }
    if (!validId(body.id) || !Array.isArray(body.messages)) throw new FoundationError('invalid_input')
    const last = body.messages.at(-1), requestId = last?.metadata?.requestId
    if (last?.role !== 'user' || !validId(requestId)) throw new FoundationError('invalid_input')
    const text = last.parts?.filter(p => p.type === 'text').map(p => p.text ?? '').join('').trim() ?? ''
    if (!text || text.length > 12_000) throw new FoundationError('invalid_input')
    const { record, session } = await research.store.owned(body.id)
    if (session.archived) throw new FoundationError('session_archived')
    if ((record.activeInput && record.activeInput !== requestId) ||
      (['running', 'awaiting_approval'].includes(session.run_status ?? '') && !record.inputs[requestId])) throw new FoundationError('research_busy')
    return bot.webhooks.web(c.req.raw)
  })
  app.get('/api/history', async c => {
    const id = c.req.query('conversation') ?? ''
    const view = await research.history(id)
    if (['queued', 'running', 'awaiting_approval', 'uncertain'].includes(view.status)) void research.observe(id).catch(() => {})
    return c.json(view)
  })
  app.get('/api/activity', async c => {
    const id = c.req.query('conversation') ?? ''
    await research.store.owned(id) // Ownership precedes subscription; no browser-supplied Platform IDs.
    const signal = c.req.raw.signal, encoder = new TextEncoder()
    let unsubscribe = () => {}, heartbeat: ReturnType<typeof setInterval> | undefined, closed = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const close = () => { if (closed) return; closed = true; unsubscribe(); clearInterval(heartbeat); try { controller.close() } catch {} }
        const publish = () => {
          if (closed) return
          const view = research.snapshot(id)
          const data = { status: view.status, tools: view.tools.slice(-200), lastSeq: view.lastSeq, historyChanged: true }
          try { controller.enqueue(encoder.encode(`id: ${view.lastSeq}\ndata: ${JSON.stringify(data)}\n\n`)) } catch { close() }
        }
        // Full projection snapshots are replayable; reconnect never relies on Platform forwarding Last-Event-ID.
        unsubscribe = research.subscribe(id, publish)
        void research.history(id).then(publish).catch(close)
        void research.observe(id).catch(close)
        heartbeat = setInterval(() => { try { controller.enqueue(encoder.encode(': ping\n\n')) } catch { close() } }, 15_000)
        signal.addEventListener('abort', close, { once: true })
      },
      cancel() { closed = true; unsubscribe(); clearInterval(heartbeat) },
    })
    return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } })
  })
  app.post('/api/sessions/:id/interrupt', async c => c.json({ accepted: await research.interrupt(c.req.param('id')) }))
  app.get('/api/sessions/:id/briefs/:brief/markdown', async c => {
    const view = await research.history(c.req.param('id'))
    const brief = view.briefs.find(b => b.id === c.req.param('brief'))
    if (!brief) throw new FoundationError('brief_not_found')
    return new Response(brief.markdown, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store',
      'content-disposition': `attachment; filename="research-brief.md"; filename*=UTF-8''${encodeURIComponent(markdownFilename(view.title))}` } })
  })
  return app
}
