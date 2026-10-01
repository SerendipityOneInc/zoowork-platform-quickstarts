import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createZooworkClient, ZooworkError, type AgentRecord, type AgentResource, type ZooworkClient } from '@zoowork-ai/sdk'

export const STAGING_URL = 'https://claw-interface.ecap.yesy.live/service/v1'
export class FoundationError extends Error {
  constructor(readonly code: string) { super(code) }
}
export interface Config { apiKey: string; baseUrl: string }
export interface State {
  version: 1
  demo: string
  baseUrl: string
  instance: string
  resource: AgentResource
  agentId?: string
  sessionRequest?: { metadata: Record<string, string>; initial_events: { type: 'user.message'; content: string }[] }
  sessionId?: string
  pendingUpdate?: Record<string, unknown>
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = env.ZOOWORK_API_KEY?.trim()
  if (!apiKey?.startsWith('zwp_live_') || apiKey.length <= 9) throw new FoundationError('platform_project_key_required')
  let url: URL
  try { url = new URL(env.ZOOWORK_BASE_URL ?? '') } catch { throw new FoundationError('explicit_public_base_url_required') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      url.pathname.replace(/\/$/, '') !== '/service/v1') throw new FoundationError('invalid_public_base_url')
  return { apiKey, baseUrl: url.origin + '/service/v1' }
}
export function requireStaging(config: Config, confirmed: boolean): void {
  if (!confirmed) throw new FoundationError('staging_confirmation_required')
  if (config.baseUrl !== STAGING_URL) throw new FoundationError('staging_endpoint_required')
}
export function safeError(error: unknown): string {
  if (error instanceof FoundationError) return error.code
  if (error instanceof ZooworkError) return `http_${error.status}`
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) return 'timeout_or_cancelled'
  return 'request_or_runner_failed'
}
export function runtime(config: Config): { client: ZooworkClient; beginCleanup: () => void } {
  const mainSignal = AbortSignal.timeout(180_000)
  let cleanupSignal: AbortSignal | undefined
  let calls = 0
  let cleanupCalls = 0
  const expected = new URL(config.baseUrl)
  const client = createZooworkClient({ ...config, fetch: async (input, init = {}) => {
    const url = new URL(input)
    if (url.origin !== expected.origin || !url.pathname.startsWith(expected.pathname + '/') ||
        url.username || url.password || url.hash) throw new FoundationError('out_of_scope_request')
    if (cleanupSignal ? ++cleanupCalls > 12 : ++calls > 80) throw new FoundationError('request_budget_exceeded')
    const signal = AbortSignal.any([cleanupSignal ?? mainSignal, AbortSignal.timeout(30_000), ...(init.signal ? [init.signal] : [])])
    return fetch(input, { ...init, signal, redirect: 'error' })
  } })
  return { client, beginCleanup: () => { cleanupSignal ??= AbortSignal.timeout(60_000) } }
}
async function privateDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
}
export async function saveState(path: string, state: State): Promise<void> {
  await privateDirectory(path)
  const temp = path + '.' + randomUUID() + '.tmp'
  await writeFile(temp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  await rename(temp, path)
}
export async function loadState(path: string, config: Config, demo: string): Promise<State | undefined> {
  let state: State
  try { state = JSON.parse(await readFile(path, 'utf8')) as State }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw new FoundationError('invalid_state') }
  if (state.version !== 1 || state.demo !== demo || state.baseUrl !== config.baseUrl ||
      typeof state.instance !== 'string' || !state.instance || !state.resource ||
      state.resource.labels?.starter_demo !== demo || state.resource.labels?.starter_instance !== state.instance ||
      (state.agentId !== undefined && (typeof state.agentId !== 'string' || !state.agentId))) {
    throw new FoundationError('state_scope_mismatch')
  }
  return state
}
export function newState(config: Config, demo: string, resource: AgentResource): State {
  const instance = randomUUID()
  return { version: 1, demo, baseUrl: config.baseUrl, instance, resource: {
    ...resource, labels: { ...resource.labels, starter_demo: demo, starter_instance: instance },
  } }
}
export async function withStateLock<T>(path: string, action: () => Promise<T>): Promise<T> {
  await privateDirectory(path)
  const lockPath = path + '.lock'
  let lock
  try { lock = await open(lockPath, 'wx', 0o600) }
  catch { throw new FoundationError('state_locked_review_before_retry') }
  try { return await action() } finally { await lock.close(); await rm(lockPath) }
}
export async function ownedAgent(client: ZooworkClient, state: State): Promise<AgentRecord> {
  if (!state.agentId) throw new FoundationError('agent_creation_uncertain_retry_setup')
  const agent = await client.getAgent(state.agentId)
  const labels = agent.declared?.labels as Record<string, unknown> | undefined
  if (labels?.starter_demo !== state.demo || labels?.starter_instance !== state.instance) {
    throw new FoundationError('agent_label_mismatch')
  }
  return agent
}
export async function setupAgent(client: ZooworkClient, state: State, path: string): Promise<string> {
  // Persist the exact body and key before create. Caller must hold the state lock.
  await saveState(path, state)
  if (!state.agentId) {
    const created = await client.createAgent({ resource: state.resource }, `platform-starter:${state.demo}:${state.instance}`)
    if (!created.agent_id) throw new FoundationError('invalid_create_receipt')
    state.agentId = created.agent_id
    await saveState(path, state)
  }
  await ownedAgent(client, state)
  await client.startAgent(state.agentId)
  await client.waitUntilRunning(state.agentId, { timeoutMs: 30_000 })
  return state.agentId
}
export async function cleanupAgent(client: ZooworkClient, state: State, path: string): Promise<void> {
  await ownedAgent(client, state)
  if (state.sessionRequest && !state.sessionId) throw new FoundationError('session_creation_uncertain_keep_state')
  if (state.sessionId) {
    try { await client.deleteSession(state.agentId!, state.sessionId) }
    catch (error) { if (!(error instanceof ZooworkError && error.status === 404)) throw error }
    delete state.sessionId
    delete state.sessionRequest
    await saveState(path, state)
  }
  // A failed stop must not be followed by delete or removal of recovery state.
  await client.stopAgent(state.agentId!)
  await client.deleteAgent(state.agentId!)
  await rm(path)
}
