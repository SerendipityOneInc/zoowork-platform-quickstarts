import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { type AgentRecord, type ZooworkClient, ZooworkError } from '@zoowork-ai/sdk'
import { cleanupAgent, loadState, newState, readConfig, requireStaging, safeError, setupAgent, STAGING_URL, withStateLock } from '../src/platform.js'
const config = { apiKey: 'zwp_live_synthetic_not_a_real_key', baseUrl: STAGING_URL }
async function temp(action: (path: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'platform-foundation-'))
  try { await action(join(dir, 'agent.json')) } finally { await rm(dir, { recursive: true, force: true }) }
}
function fake(state: ReturnType<typeof newState>, failStop = false) {
  const calls: string[] = []
  const agent: AgentRecord = { agent_id: 'agt_synthetic', declared: { labels: state.resource.labels } }
  const client = {
    createAgent: async (body: unknown, key: string) => { calls.push('create'); assert.deepEqual(body, { resource: state.resource }); assert.ok(key.includes(state.instance)); return agent },
    getAgent: async () => { calls.push('get'); return agent },
    startAgent: async () => { calls.push('start'); return { warnings: [] } },
    waitUntilRunning: async () => { calls.push('wait'); return agent },
    stopAgent: async () => { calls.push('stop'); if (failStop) throw new Error('synthetic failure'); return { warnings: [] } },
    deleteAgent: async () => { calls.push('delete') },
    deleteSession: async () => { calls.push('delete-session') },
  } as unknown as ZooworkClient
  return { client, calls, agent }
}
test('staging smoke refuses production and missing confirmation', () => {
  assert.throws(() => requireStaging(config, false), /staging_confirmation_required/)
  assert.throws(() => requireStaging({ ...config, baseUrl: 'https://clawapi.ecap.gsmo.ai/service/v1' }, true), /staging_endpoint_required/)
  requireStaging(config, true)
})
test('only Project keys and plain public API URLs are accepted', () => {
  assert.throws(() => readConfig({ ZOOWORK_API_KEY: 'synthetic-invalid', ZOOWORK_BASE_URL: STAGING_URL }), /platform_project_key_required/)
  assert.throws(() => readConfig({ ZOOWORK_API_KEY: config.apiKey, ZOOWORK_BASE_URL: STAGING_URL + '?key=secret' }), /invalid_public_base_url/)
  assert.deepEqual(readConfig({ ZOOWORK_API_KEY: config.apiKey, ZOOWORK_BASE_URL: STAGING_URL + '/' }), config)
})
test('setup persists exact create state and reuses the Agent on restart', async () => temp(async path => {
  const state = newState(config, 'synthetic', { name: 'test' }); const f = fake(state)
  await setupAgent(f.client, state, path)
  const reloaded = (await loadState(path, config, 'synthetic'))!
  await setupAgent(f.client, reloaded, path)
  assert.equal(f.calls.filter(c => c === 'create').length, 1)
  assert.ok(!(await readFile(path, 'utf8')).includes(config.apiKey))
}))
test('ambiguous create retains the exact body and idempotency identity', async () => temp(async path => {
  const state = newState(config, 'synthetic', { name: 'test' }); const f = fake(state)
  f.client.createAgent = async () => { throw new Error('network failure') }
  await assert.rejects(setupAgent(f.client, state, path))
  assert.deepEqual(await loadState(path, config, 'synthetic'), state)
  assert.equal(f.calls.includes('delete'), false)
}))
test('a recorded 404 does not create a replacement Agent', async () => temp(async path => {
  const state = newState(config, 'synthetic', { name: 'test' }); state.agentId = 'agt_synthetic'
  const f = fake(state); f.client.getAgent = async () => { throw new ZooworkError(404, 'synthetic') }
  await assert.rejects(setupAgent(f.client, state, path))
  assert.equal(f.calls.includes('create'), false)
}))
test('cleanup refuses labels from another application instance', async () => temp(async path => {
  const state = newState(config, 'synthetic', { name: 'test' }); const f = fake(state)
  await setupAgent(f.client, state, path)
  f.agent.declared = { labels: { starter_demo: 'synthetic', starter_instance: 'another' } }
  await assert.rejects(cleanupAgent(f.client, state, path), /agent_label_mismatch/)
  assert.equal(f.calls.includes('stop'), false)
}))
test('failed stop retains recovery state and prevents delete', async () => temp(async path => {
  const state = newState(config, 'synthetic', { name: 'test' }); const f = fake(state, true)
  await setupAgent(f.client, state, path)
  await assert.rejects(cleanupAgent(f.client, state, path))
  assert.equal(f.calls.includes('delete'), false)
  assert.ok(await loadState(path, config, 'synthetic'))
}))
test('ambiguous Session creation is retained for investigation', async () => temp(async path => {
  const state = newState(config, 'synthetic', { name: 'test' }); const f = fake(state)
  await setupAgent(f.client, state, path)
  state.sessionRequest = { metadata: {}, initial_events: [] }
  await assert.rejects(cleanupAgent(f.client, state, path), /session_creation_uncertain_keep_state/)
  assert.equal(f.calls.includes('delete'), false)
}))
test('cleanup deletes the Session then stops/deletes Agent and removes state', async () => temp(async path => {
  const state = newState(config, 'synthetic', { name: 'test' }); const f = fake(state)
  await setupAgent(f.client, state, path); state.sessionId = 'session-synthetic'
  await cleanupAgent(f.client, state, path)
  assert.deepEqual(f.calls.slice(-4), ['get', 'delete-session', 'stop', 'delete'])
  assert.equal(await loadState(path, config, 'synthetic'), undefined)
}))
test('state cannot cross API deployments or demo directories', async () => temp(async path => {
  const state = newState(config, 'synthetic', { name: 'test' }); const f = fake(state)
  await setupAgent(f.client, state, path)
  await assert.rejects(loadState(path, { ...config, baseUrl: 'https://other.example/service/v1' }, 'synthetic'), /state_scope_mismatch/)
  await assert.rejects(loadState(path, config, 'another'), /state_scope_mismatch/)
}))
test('concurrent setup attempts are rejected by the state lock', async () => temp(async path => {
  await withStateLock(path, async () => assert.rejects(withStateLock(path, async () => {}), /state_locked/))
  await withStateLock(path, async () => {})
}))
test('failures never print the raw provider body or key', () => {
  assert.equal(safeError(new Error(config.apiKey)), 'request_or_runner_failed')
  assert.equal(safeError(new ZooworkError(401, config.apiKey)), 'http_401')
})
