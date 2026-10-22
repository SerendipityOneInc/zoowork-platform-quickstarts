import { resolve } from 'node:path'
import { createZooworkClient } from '@zoowork-ai/sdk'
import { agentResource, demo } from '../src/agent.js'
import { cleanupAgent, FoundationError, loadState, newState, ownedAgent, readApiKey, safeError, setupAgent, withStateLock } from '../src/platform.js'

const command = process.argv[2]
try {
  if (!['setup', 'status', 'cleanup'].includes(command ?? '')) throw new FoundationError('expected_setup_status_or_cleanup')
  const path = resolve('.local', 'agent.json')
  const client = createZooworkClient({ apiKey: readApiKey() })
  await withStateLock(path, async () => {
    let state = await loadState(path, demo)
    if (command === 'setup') {
      state ??= newState(demo, agentResource())
      const id = await setupAgent(client, state, path)
      console.log(`Agent ready: ${id}`)
      return
    }
    if (!state) throw new FoundationError('run_setup_first')
    if (command === 'cleanup') {
      await cleanupAgent(client, state, path)
      console.log('Cleanup complete')
    } else {
      const agent = await ownedAgent(client, state)
      console.log(JSON.stringify({ agentId: agent.agent_id, desiredState: agent.status?.desired_state ?? 'unknown' }))
    }
  })
} catch (error) {
  console.error(`FAIL: ${safeError(error)}; check configuration and retained .local state.`)
  process.exitCode = 1
}
