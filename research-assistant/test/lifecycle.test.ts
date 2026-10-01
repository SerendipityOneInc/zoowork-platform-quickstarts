import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { cleanupConversations, updateAgent } from '../src/lifecycle.js'
import { fixture } from './fixtures.js'

test('cleanup refuses foreign Session metadata before any delete', async () => {
  const f = await fixture()
  try {
    const c = await f.store.create('foreign', randomUUID())
    f.platform.sessions.get(c.sessionId!)!.record.metadata!.instance = 'another-instance'
    await assert.rejects(cleanupConversations(f.store), /conversation_not_found/)
    assert.equal(f.platform.calls.some(c => c.method === 'delete-session'), false)
  } finally { await f.close() }
})
test('cleanup preserves ambiguous create state and only deletes recorded matching Sessions', async () => {
  const f = await fixture()
  try {
    const request = randomUUID()
    f.platform.ambiguousCreate = true
    await assert.rejects(f.store.create('pending', request))
    await assert.rejects(cleanupConversations(f.store), /session_creation_uncertain/)
    await f.store.create('pending', request)
    const unrelated = await f.platform.client.createSession(f.platform.state.agentId!, { metadata: { owner: 'another' } })
    await cleanupConversations(f.store)
    assert.equal(f.platform.sessions.size, 1); assert.ok(f.platform.sessions.has(unrelated.session_id))
    assert.equal((await f.store.list())[0].status, 'deleted')
  } finally { await f.close() }
})
test('update retains create body and reconciles an applied update after its receipt is lost', async () => {
  const f = await fixture()
  try {
    const original = structuredClone(f.platform.state.resource), path = join(f.directory, 'agent.json')
    let calls = 0, applied: Record<string, unknown> = { ...original }
    f.platform.client.getAgent = async () => ({ agent_id: f.platform.state.agentId!, declared: applied })
    f.platform.client.updateAgent = async (_id, sections) => { calls++; applied = sections; throw new Error('fixture_lost_update_receipt') }
    await assert.rejects(updateAgent(f.platform.client, f.platform.state, path, { name: 'Updated research app' }))
    assert.ok(f.platform.state.pendingUpdate)
    await updateAgent(f.platform.client, f.platform.state, path, { name: 'Different desired body' })
    assert.equal(calls, 1); assert.equal(f.platform.state.pendingUpdate, undefined)
    assert.deepEqual(f.platform.state.resource, original)
  } finally { await f.close() }
})
