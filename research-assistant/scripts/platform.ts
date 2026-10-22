import { resolve } from 'node:path'
import { rename } from 'node:fs/promises'
import { createZooworkClient } from '@zoowork-ai/sdk'
import { agentResource, demo } from '../src/agent.js'
import { cleanupAgent, FoundationError, loadState, newState, ownedAgent, readApiKey, safeError, setupAgent, withStateLock } from '../src/platform.js'
import { Conversations } from '../src/conversations.js'
import { cleanupConversations, updateAgent } from '../src/lifecycle.js'
import { processLease } from '../src/web-runtime.js'

const command = process.argv[2]
let release: (() => Promise<void>) | undefined
try {
  if (!['setup', 'status', 'cleanup', 'update', 'recover'].includes(command ?? '')) throw new FoundationError('expected_setup_status_cleanup_update_or_recover')
  const path = resolve('.local', 'agent.json')
  const client = createZooworkClient({ apiKey: readApiKey() })
  if (command !== 'status') release = await processLease()
  await withStateLock(path, async () => {
    let state = await loadState(path, demo)
    if (command === 'setup') {
      state ??= newState(demo, agentResource())
      const id = await setupAgent(client, state, path)
      console.log(`Agent ready: ${id}`)
      return
    }
    if (!state) throw new FoundationError('run_setup_first')
    const records = resolve('.local', 'conversations')
    const store = new Conversations(records, state, client)
    if (command === 'recover') {
      console.log(`Recovered ${await store.recoverIndex()} conversation records`); return
    }
    if (command === 'update') {
      await updateAgent(client, state, path, agentResource()); console.log('Agent research configuration updated'); return
    }
    if (command === 'cleanup') {
      await cleanupConversations(store)
      await cleanupAgent(client, state, path)
      if ((await store.list()).length) {
        await rename(records, `${records}.retired-${state.instance.replace(/[^a-zA-Z0-9_-]/g, '_')}`)
      }
      console.log('Cleanup complete')
    } else {
      const agent = await ownedAgent(client, state)
      console.log(JSON.stringify({ agentId: agent.agent_id, desiredState: agent.status?.desired_state ?? 'unknown' }))
    }
  })
} catch (error) {
  console.error(`FAIL: ${safeError(error)}; check configuration and retained .local state.`)
  process.exitCode = 1
} finally { if (release) await release() }
