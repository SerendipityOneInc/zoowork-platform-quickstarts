import { resolve } from 'node:path'
import { rename } from 'node:fs/promises'
import { agentResource, demo } from '../src/agent.js'
import { cleanupAgent, FoundationError, loadState, newState, ownedAgent, readConfig, runtime, safeError, setupAgent, withStateLock } from '../src/platform.js'
import { Conversations } from '../src/conversations.js'
import { cleanupConversations, updateAgent } from '../src/lifecycle.js'
import { processLease } from '../src/web-runtime.js'

const command = process.argv[2]
const filename = process.argv[3] ?? 'agent.json'
let release: (() => Promise<void>) | undefined
try {
  if (!['setup', 'status', 'cleanup', 'update', 'recover'].includes(command ?? '')) throw new FoundationError('expected_setup_status_cleanup_update_or_recover')
  if (!/^[a-zA-Z0-9_-]+\.json$/.test(filename)) throw new FoundationError('state_filename_required')
  const path = resolve('.local', filename)
  const config = readConfig()
  const rt = runtime(config)
  if (filename === 'agent.json' && command !== 'status') release = await processLease()
  await withStateLock(path, async () => {
    let state = await loadState(path, config, demo)
    if (command === 'setup') {
      if (filename !== 'agent.json') throw new FoundationError('setup_uses_agent_state')
      state ??= newState(config, demo, agentResource())
      const id = await setupAgent(rt.client, state, path)
      console.log(`Agent ready: ${id}`)
      return
    }
    if (!state) throw new FoundationError('run_setup_first')
    const records = filename === 'agent.json' ? resolve('.local', 'conversations') : resolve('.local', filename.slice(0, -5) + '-conversations')
    const store = new Conversations(records, state, rt.client)
    if (command === 'recover') {
      console.log(`Recovered ${await store.recoverIndex()} conversation records`); return
    }
    if (command === 'update') {
      await updateAgent(rt.client, state, path, agentResource()); console.log('Agent research configuration updated'); return
    }
    if (command === 'cleanup') {
      rt.beginCleanup()
      await cleanupConversations(store)
      await cleanupAgent(rt.client, state, path)
      if (filename === 'agent.json' && (await store.list()).length) {
        await rename(records, `${records}.retired-${state.instance.replace(/[^a-zA-Z0-9_-]/g, '_')}`)
      }
      console.log('Cleanup complete')
    } else {
      const agent = await ownedAgent(rt.client, state)
      console.log(JSON.stringify({ agentId: agent.agent_id, desiredState: agent.status?.desired_state ?? 'unknown' }))
    }
  })
} catch (error) {
  console.error(`FAIL: ${safeError(error)}; check configuration and retained .local state.`)
  process.exitCode = 1
} finally { if (release) await release() }
