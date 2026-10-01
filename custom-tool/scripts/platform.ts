import { resolve } from 'node:path'
import { agentResource, demo } from '../src/agent.js'
import { cleanupAgent, FoundationError, loadState, newState, ownedAgent, readConfig, runtime, safeError, setupAgent, withStateLock } from '../src/platform.js'

const command = process.argv[2]
const filename = process.argv[3] ?? 'agent.json'
try {
  if (!['setup', 'status', 'cleanup'].includes(command ?? '')) throw new FoundationError('expected_setup_status_or_cleanup')
  if (!/^[a-zA-Z0-9_-]+\.json$/.test(filename)) throw new FoundationError('state_filename_required')
  const path = resolve('.local', filename)
  const config = readConfig()
  const rt = runtime(config)
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
    if (command === 'cleanup') {
      rt.beginCleanup()
      await cleanupAgent(rt.client, state, path)
      console.log('Cleanup complete')
    } else {
      const agent = await ownedAgent(rt.client, state)
      console.log(JSON.stringify({ agentId: agent.agent_id, desiredState: agent.status?.desired_state ?? 'unknown' }))
    }
  })
} catch (error) {
  console.error(`FAIL: ${safeError(error)}; check configuration and retained .local state.`)
  process.exitCode = 1
}
