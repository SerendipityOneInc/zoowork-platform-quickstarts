import { createZooworkClient } from '@zoowork-ai/sdk'
import { mkdir, open, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Conversations } from './conversations.js'
import { FoundationError, loadState, readApiKey, ownedAgent } from './platform.js'
import { Research } from './turns.js'

export async function webRuntime(directory = resolve('.local')): Promise<Research> {
  const apiKey = readApiKey()
  const state = await loadState(resolve(directory, 'agent.json'), 'research-assistant')
  if (!state?.agentId) throw new FoundationError('run_setup_first')
  const client = createZooworkClient({ apiKey })
  const store = new Conversations(resolve(directory, 'conversations'), state, client)
  const agent = await ownedAgent(store.client, state)
  if (agent.status?.desired_state !== 'running') throw new FoundationError('agent_not_running')
  return new Research(store)
}
// One local process owns the registry. A crashed process is recoverable; a live PID is never evicted.
export async function processLease(directory = resolve('.local')): Promise<() => Promise<void>> {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const path = resolve(directory, 'web.lock')
  try {
    const pid = Number(await readFile(path, 'utf8'))
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new FoundationError('web_lock_requires_review')
    try { process.kill(pid, 0); throw new FoundationError('web_process_already_running') }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e }
    await rm(path)
  } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
  const lock = await open(path, 'wx', 0o600)
  await lock.writeFile(String(process.pid)); await lock.close()
  return async () => { if (await readFile(path, 'utf8').catch(() => '') === String(process.pid)) await rm(path) }
}
