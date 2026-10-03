import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { SessionEvent, ZooworkClient } from '@zoowork-ai/sdk'
import { SdkDebug, traceClient } from '../src/sdk-debug.js'
import { createApi } from '../src/app.js'
import { fixture } from './fixtures.js'

test('debug observes real SDK calls and deduplicates history/stream event provenance', async () => {
  const f = await fixture()
  try {
    const c = await f.store.create('topic', randomUUID())
    await f.research.send(c.id, 'private question', randomUUID(), async () => {})
    await f.research.history(c.id)
    const view = f.store.debug.snapshot(c.agentId, true, c.sessionId, c.id)
    for (const method of ['getAgent', 'createSession', 'getSession', 'postEvents', 'listEventsPage', 'streamEvents']) {
      assert.ok(view.calls.some(c => c.method === method), method)
    }
    const input = view.calls.find(c => c.method === 'postEvents')!
    assert.deepEqual(input.params.types, ['user.message']); assert.equal(input.params.contentCharacters, 16)
    const fetch = view.events.filter(e => e.tool === 'web_fetch' && e.phase === 'end')
    assert.equal(fetch.length, 2)
    assert.ok(fetch.every(e => e.sources.includes('stream') && e.sources.includes('history')))
    assert.equal(new Set(view.events.map(e => e.seq)).size, view.events.length)
    assert.ok(!JSON.stringify(view).includes('private question'))
    assert.equal(f.platform.calls.filter(c => c.method === 'user.message').length, 1)
  } finally { await f.close() }
})

test('in-flight calls and streams retain return values, errors and cancellation semantics without storing secrets', async () => {
  const debug = new SdkDebug(), secret = 'zwp_live_do_not_expose_this_value'
  const rejected = new Error(secret)
  let finish!: (value: unknown) => void
  let streamClosed = false
  const event: SessionEvent = { id: randomUUID(), seq: 1, eventType: 'agent.assistant', runId: randomUUID(),
    cursor: secret, payload: { content: secret, headers: { authorization: secret } } }
  const client = traceClient({
    getAgent: () => new Promise(resolve => { finish = resolve }),
    getSession: async () => { throw rejected },
    streamEvents: async function* () { try { yield event; yield { ...event, seq: 2 } } finally { streamClosed = true } },
  } as unknown as ZooworkClient, debug)
  const pending = client.getAgent('agent-debug')
  let view = debug.snapshot('agent-debug', false)
  assert.equal(view.active, 1); assert.equal(view.calls[0].status, 'running')
  const result = { agent_id: 'agent-debug', declared: { secret }, status: { desired_state: 'running' } }
  finish(result); assert.equal(await pending, result)
  await assert.rejects(client.getSession('agent-debug', 'session-debug'), e => e === rejected)
  const stream = client.streamEvents('agent-debug', 'session-debug', { cursor: secret })
  const iterator = stream[Symbol.asyncIterator]()
  assert.equal((await iterator.next()).value, event)
  view = debug.snapshot('agent-debug', false)
  assert.equal(view.calls.at(-1)!.status, 'running'); assert.equal(view.calls.at(-1)!.received, 1)
  await iterator.return?.(undefined)
  assert.equal(streamClosed, true)
  view = debug.snapshot('agent-debug', false)
  assert.equal(view.active, 0); assert.equal(view.calls.at(-1)!.status, 'closed')
  assert.equal(view.calls[1].error, 'request_or_runner_failed')
  debug.event('session-debug', { ...event, seq: 3, runId: secret }, 'history')
  const badIdCall = debug.begin('getAgent', [secret]); debug.finish(badIdCall, 'succeeded', result)
  view = debug.snapshot('agent-debug', false)
  assert.ok(!JSON.stringify(view).includes(secret))
})

test('debug endpoint is local, scoped to the selected app conversation, bounded and read-only', async () => {
  const f = await fixture()
  try {
    const a = await f.store.create('one', randomUUID()), b = await f.store.create('two', randomUUID())
    await f.research.send(a.id, 'first', randomUUID(), async () => {})
    await f.research.send(b.id, 'second', randomUUID(), async () => {})
    const api = createApi(f.research, true), before = f.store.debug.snapshot(a.agentId, true).calls.length
    const response = await api.request(`http://localhost/api/debug?conversation=${a.id}`)
    assert.equal(response.status, 200)
    const view = await response.json()
    assert.equal(view.fixture, true); assert.equal(view.sessionId, a.sessionId)
    assert.ok(view.calls.every((c: { sessionId?: string }) => !c.sessionId || c.sessionId === a.sessionId))
    assert.ok(view.events.every((e: { sessionId: string }) => e.sessionId === a.sessionId))
    assert.equal(f.store.debug.snapshot(a.agentId, true).calls.length, before)
    assert.equal((await api.request('http://localhost/api/debug?conversation=invalid-id')).status, 404)
    assert.equal((await api.request('http://localhost/api/debug', { headers: { origin: 'https://attacker.example' } })).status, 403)
    for (let i = 0; i < 220; i++) await f.store.client.getAgent(a.agentId)
    assert.ok(f.store.debug.snapshot(a.agentId, true).calls.length <= 160)
    assert.ok(f.store.debug.snapshot(a.agentId, true).calls.some(c => c.method === 'postEvents'))
    const event: SessionEvent = { id: randomUUID(), seq: 1, eventType: 'user.message', payload: { content: 'not retained' } }
    for (let i = 0; i < 250; i++) f.store.debug.event(a.sessionId!, { ...event, seq: 100 + i }, 'history')
    assert.equal(f.store.debug.snapshot(a.agentId, true).events.length, 200)
    assert.equal(f.platform.calls.filter(c => c.method === 'user.message').length, 2)
    const inFlight = new SdkDebug()
    for (let i = 0; i < 180; i++) inFlight.begin('getAgent', [a.agentId])
    assert.equal(inFlight.snapshot(a.agentId, true).calls.length, 160)
  } finally { await f.close() }
})
