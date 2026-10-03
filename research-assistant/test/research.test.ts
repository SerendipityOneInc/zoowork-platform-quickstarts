import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { ZooworkError } from '@zoowork-ai/sdk'
import { project, safeUrl, sourcesOf } from '../src/brief.js'
import { Research, allEvents } from '../src/turns.js'
import { createApi } from '../src/app.js'
import { fixture, report, urls } from './fixtures.js'

test('two research turns retain separate briefs, exact export and restart history', async () => {
  const f = await fixture()
  try {
    const c = await f.store.create('版本选择', randomUUID()), request = randomUUID(), delivered: string[] = []
    await f.research.send(c.id, '研究版本', request, async text => delivered.push(text))
    let view = await f.research.history(c.id)
    assert.equal(view.status, 'succeeded'); assert.equal(view.briefs.length, 1); assert.equal(view.briefs[0].ready, true)
    const activityAt = (await f.store.read(c.id)).updatedAt
    await f.research.observe(c.id)
    assert.equal((await f.store.read(c.id)).updatedAt, activityAt)
    assert.deepEqual(view.briefs[0].sources.map(s => s.state), ['read', 'read']); assert.equal(delivered.at(-1), report())
    await f.research.send(c.id, '研究版本', request, async () => {})
    assert.equal(f.platform.calls.filter(c => c.method === 'user.message').length, 1)
    await f.research.send(c.id, '更新简报：支持周期', randomUUID(), async () => {})
    view = await new Research(f.store).history(c.id)
    assert.equal(view.briefs.length, 2); assert.equal(view.messages.filter(m => m.role === 'user').length, 2)
    const api = createApi(f.research)
    const response = await api.request(`http://localhost/api/sessions/${c.id}/briefs/${view.briefs[0].id}/markdown`)
    assert.equal(response.status, 200); assert.equal(await response.text(), report())
    assert.ok(!(await readFile(join(f.directory, 'conversations', c.id + '.json'), 'utf8')).includes('研究版本'))
  } finally { await f.close() }
})
test('disconnect and ambiguous input receipt recover by reading; they never resend input', async () => {
  const f = await fixture()
  try {
    const c = await f.store.create('重连', randomUUID()), request = randomUUID()
    f.platform.ambiguousInput = true
    await assert.rejects(f.research.send(c.id, '同一问题', request, async () => {}))
    f.platform.dropStream = true
    const recovered = new Research(f.store, 1500)
    await recovered.send(c.id, '同一问题', request, async () => {})
    assert.equal((await recovered.history(c.id)).briefs.length, 1)
    assert.equal(f.platform.calls.filter(c => c.method === 'user.message').length, 1)
    assert.equal((await f.store.read(c.id)).activeInput, undefined)
  } finally { await f.close() }
})
test('create uses the same idempotency key after a lost receipt and rejects changed full topics', async () => {
  const f = await fixture()
  try {
    const request = randomUUID(), topic = '很长的题目'.repeat(40)
    f.platform.ambiguousCreate = true
    await assert.rejects(f.store.create(topic, request))
    const c = await f.store.create(topic, request)
    assert.equal(f.platform.sessions.size, 1)
    assert.deepEqual(f.platform.calls.filter(c => c.method === 'create').map(c => c.key), [c.createKey, c.createKey])
    await assert.rejects(f.store.create(topic + '变更', request), /request_content_conflict/)
  } finally { await f.close() }
})
test('busy, archived, foreign metadata and forged origins are rejected; interrupt is a server operation', async () => {
  const f = await fixture()
  try {
    f.platform.delay = 1000
    const c = await f.store.create('停止研究', randomUUID())
    const turn = f.research.send(c.id, '开始', randomUUID(), async () => {})
    while (!(await f.store.read(c.id)).activeInput) await new Promise(r => setTimeout(r, 5))
    await assert.rejects(f.research.send(c.id, '冲突', randomUUID(), async () => {}), /research_busy/)
    assert.equal(await f.research.interrupt(c.id), true); await turn
    assert.equal((await f.research.history(c.id)).status, 'aborted')
    assert.equal(await f.research.interrupt(c.id), false)
    const s = f.platform.sessions.get(c.sessionId!)!
    s.record.archived = true
    await assert.rejects(f.research.send(c.id, '归档输入', randomUUID(), async () => {}), /session_archived/)
    assert.equal((await f.research.history(c.id)).archived, true)
    s.record.metadata = { ...s.record.metadata, owner: 'another' }
    await assert.rejects(f.research.history(c.id), /conversation_not_found/)
    const response = await createApi(f.research).request('http://localhost/api/sessions', { headers: { origin: 'https://attacker.example' } })
    assert.equal(response.status, 403)
  } finally { await f.close() }
})
test('full history pagination preserves earlier inputs and the registry can recover matching metadata', async () => {
  const f = await fixture()
  try {
    const c = await f.store.create('分页恢复', randomUUID())
    await f.research.send(c.id, '问题', randomUUID(), async () => {})
    f.platform.pageSize = 2
    assert.equal((await allEvents(f.platform.client, c.agentId, c.sessionId!)).length, 11)
    await rm(join(f.store.directory, c.id + '.json'))
    assert.equal(await f.store.recoverIndex(), 1)
    assert.equal((await f.research.history(c.id)).briefs.length, 1)
  } finally { await f.close() }
})
test('tool failure does not fail the run, and unexecuted fetches do not verify sources', async () => {
  const f = await fixture()
  try {
    const c = await f.store.create('来源', randomUUID())
    await f.research.send(c.id, '问题', randomUUID(), async () => {})
    const events = await allEvents(f.platform.client, c.agentId, c.sessionId!)
    const end = events.find(e => e.eventType === 'agent.tool' && e.payload.phase === 'end' && e.payload.toolName === 'web_fetch')!
    end.payload.executionStarted = false; end.payload.isError = true
    const view = project([...events, ...events].reverse())
    assert.equal(view.status, 'succeeded'); assert.equal(view.briefs[0].ready, false); assert.equal(view.briefs[0].sources[0].state, 'search')
    assert.equal(view.tools.length, 3)
    assert.equal(safeUrl('javascript:alert(1)'), undefined); assert.equal(safeUrl('https://user:password@example.com'), undefined)
    assert.equal(sourcesOf(`## 来源\n[bad](javascript:alert)\n[one](${urls[0]})\n[dup](${urls[0]})`).length, 1)
  } finally { await f.close() }
})
test('different public/ingress IDs and an input echo after run.started still associate one new API run', async () => {
  const f = await fixture()
  try {
    const c = await f.store.create('late echo', randomUUID()), delivered: string[] = []
    f.platform.client.postEvents = async (_agent, id, inputs) => {
      const run = randomUUID()
      f.platform.emit(id, 'run.started', { trigger: 'user_message', surface: 'api', inboundMessageId: randomUUID() }, run)
      f.platform.emit(id, 'agent.assistant', { message: { content: '已收到问题。' } }, run)
      const echo = f.platform.emit(id, 'user.message', { content: inputs[0].content })
      f.platform.emit(id, 'run.finished', { status: 'succeeded' }, run)
      return { events: [{ id: echo.id, seq: echo.seq, accepted: true }] }
    }
    await f.research.send(c.id, '问题', randomUUID(), async text => delivered.push(text))
    assert.equal((await f.store.read(c.id)).activeInput, undefined)
    assert.deepEqual(delivered, ['已收到问题。'])
  } finally { await f.close() }
})
test('an old terminal cannot finish a new input, and a definitely rejected input releases its lock', async () => {
  const f = await fixture()
  try {
    const c = await f.store.create('older terminal', randomUUID()), previous = randomUUID()
    f.platform.emit(c.sessionId!, 'run.started', { inboundMessageId: randomUUID() }, previous)
    f.platform.client.postEvents = async (_agent, id) => {
      f.platform.emit(id, 'run.finished', { status: 'succeeded' }, previous)
      throw new Error('fixture_unknown_submission')
    }
    await assert.rejects(f.research.send(c.id, 'pending', randomUUID(), async () => {}))
    const observing = f.research.observe(c.id)
    await f.research.close(); await observing
    assert.ok((await f.store.read(c.id)).activeInput)
    assert.equal((await f.research.history(c.id)).status, 'uncertain')
  } finally { await f.close() }
  const rejected = await fixture()
  try {
    const c = await rejected.store.create('reject', randomUUID())
    rejected.platform.client.postEvents = async () => { throw new ZooworkError(402, 'synthetic') }
    await assert.rejects(rejected.research.send(c.id, 'question', randomUUID(), async () => {}))
    assert.equal((await rejected.store.read(c.id)).activeInput, undefined)
    const view = await rejected.research.history(c.id)
    assert.equal(view.status, 'failed'); assert.equal(view.problem, 'http_402')
  } finally { await rejected.close() }
})
